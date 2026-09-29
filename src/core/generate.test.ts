import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { presetFeatures, presets } from '../presets.ts'
import { generate } from './generate.ts'
import { readManifest } from './manifest.ts'
import type { ProjectOptions } from './types.ts'
import { VirtualFs } from './vfs.ts'

const lynn: ProjectOptions = {
  name: 'demo',
  kind: 'frontend',
  ...presets.lynn,
  features: presetFeatures(presets.lynn, 'vue'),
}

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'create-web-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('generate (create)', () => {
  it('produces the expected files for the lynn preset', async () => {
    const { fs, notes } = await generate({
      root,
      mode: 'create',
      options: lynn,
    })
    expect(notes).toEqual([])
    expect(fs.changedPaths()).toMatchSnapshot()
  })

  it('wires features into shared files', async () => {
    const { fs } = await generate({ root, mode: 'create', options: lynn })
    expect(await fs.read('src/main.ts')).toContain(
      'app.use(createPinia())\napp.use(router)\napp.mount',
    )
    expect(await fs.read('vite.config.ts')).toContain(
      'plugins: [vue(), tailwindcss()]',
    )
    expect(await fs.read('src/App.vue')).toContain('<RouterView />')
    expect(
      JSON.parse((await fs.read('tsconfig.json')) ?? '{}').references,
    ).toContainEqual({
      path: './tsconfig.vitest.json',
    })
    expect(await fs.read('.husky/pre-push')).toContain('pnpm run test')
  })

  it('keeps a base project minimal without features', async () => {
    const { fs } = await generate({
      root,
      mode: 'create',
      options: { ...lynn, features: [] },
    })
    expect(fs.changedPaths()).not.toContain('eslint.config.js')
    expect(await fs.read('src/main.ts')).not.toContain('app.use')
  })

  it('writes CNAME instead of a base path when a Pages domain is given', async () => {
    const { fs } = await generate({
      root,
      mode: 'create',
      options: {
        ...lynn,
        features: ['github-pages'],
        pagesDomain: 'demo.example.com',
      },
    })
    expect(await fs.read('public/CNAME')).toBe('demo.example.com\n')
    expect(await fs.read('.github/workflows/deploy.yml')).not.toContain(
      '--base=',
    )
  })
})

describe('generate (create, react)', () => {
  const react: ProjectOptions = {
    ...lynn,
    framework: 'react',
    features: presetFeatures(presets.lynn, 'react'),
  }

  it('produces the expected files for the lynn preset', async () => {
    const { fs, notes } = await generate({
      root,
      mode: 'create',
      options: react,
    })
    expect(notes).toEqual([])
    expect(fs.changedPaths()).toMatchSnapshot()
  })

  it('wraps the app with providers and routes', async () => {
    const { fs } = await generate({ root, mode: 'create', options: react })
    const main = await fs.read('src/main.tsx')
    expect(main).toMatch(
      /<Provider store=\{store\}>\s*<BrowserRouter basename=\{import\.meta\.env\.BASE_URL\}>\s*<App \/>/,
    )
    expect(await fs.read('src/App.tsx')).toContain(
      '<Route path="/" element={<HomePage />} />',
    )
    expect(await fs.read('eslint.config.js')).toContain(
      'eslint-plugin-react-hooks',
    )
    expect(fs.changedPaths()).not.toContain('tsconfig.vitest.json')
  })

  it('does not offer Vue features to React projects', async () => {
    await expect(
      generate({
        root,
        mode: 'create',
        options: { ...react, features: ['pinia'] },
      }),
    ).rejects.toThrow(/does not support react/)
  })
})

describe('generate (add)', () => {
  it('applies only new features and records them in the manifest', async () => {
    const base = { ...lynn, features: [] }
    await (await generate({ root, mode: 'create', options: base })).fs.commit()

    const { fs, applied } = await generate({
      root,
      mode: 'add',
      options: { ...base, features: ['github-pages'] },
      existing: [],
    })
    await fs.commit()

    expect(applied).toEqual(['github-actions', 'github-pages'])
    expect(fs.changedPaths()).not.toContain('src/main.ts')
    expect((await readManifest(new VirtualFs(root)))?.features).toEqual([
      'github-actions',
      'github-pages',
    ])
  })

  it('leaves user-edited files alone and reports a manual step', async () => {
    await (
      await generate({
        root,
        mode: 'create',
        options: { ...lynn, features: [] },
      })
    ).fs.commit()
    await writeFile(
      join(root, 'src/App.vue'),
      '<template><p>custom</p></template>\n',
    )

    const { fs, notes } = await generate({
      root,
      mode: 'add',
      options: { ...lynn, features: ['vue-router'] },
      existing: [],
    })
    await fs.commit()

    expect(await readFile(join(root, 'src/App.vue'), 'utf8')).toContain(
      'custom',
    )
    expect(notes).toEqual(['Render `<RouterView />` in src/App.vue.'])
  })

  it('refreshes hooks, CI and AGENTS.md when a feature adds scripts', async () => {
    const base: ProjectOptions = {
      ...lynn,
      features: ['husky', 'github-actions', 'agent-docs'],
    }
    await (await generate({ root, mode: 'create', options: base })).fs.commit()
    expect(await readFile(join(root, '.husky/pre-push'), 'utf8')).not.toContain(
      'pnpm run test',
    )

    const preCommit = join(root, '.husky/pre-commit')
    await writeFile(
      preCommit,
      `${await readFile(preCommit, 'utf8')}echo custom\n`,
    )

    const { fs } = await generate({
      root,
      mode: 'add',
      options: { ...base, features: ['vitest'] },
      existing: base.features,
    })
    await fs.commit()

    expect(await readFile(join(root, '.husky/pre-push'), 'utf8')).toContain(
      'pnpm run test',
    )
    expect(await readFile(preCommit, 'utf8')).toContain('echo custom')
    expect(
      await readFile(join(root, '.github/workflows/ci.yml'), 'utf8'),
    ).toContain("command: ['typecheck', 'test', 'build']")
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toContain(
      '`pnpm run test`: run unit tests',
    )
  })
})
