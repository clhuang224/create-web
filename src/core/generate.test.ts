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
  features: presetFeatures(presets.lynn, 'frontend', 'vue'),
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
    features: presetFeatures(presets.lynn, 'frontend', 'react'),
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

  it('keeps existing files and scripts instead of overwriting them', async () => {
    const base: ProjectOptions = { ...lynn, features: [] }
    await (await generate({ root, mode: 'create', options: base })).fs.commit()
    await writeFile(join(root, 'vitest.config.ts'), '// my own config\n')
    await writeFile(join(root, '.prettierrc'), '{ "semi": true }\n')
    const pkgPath = join(root, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    pkg.scripts.test = 'node --test'
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2))

    const { fs, notes } = await generate({
      root,
      mode: 'add',
      options: { ...base, features: ['vitest', 'prettier'] },
      existing: [],
    })
    await fs.commit()

    expect(await readFile(join(root, 'vitest.config.ts'), 'utf8')).toBe(
      '// my own config\n',
    )
    expect(await readFile(join(root, '.prettierrc'), 'utf8')).toBe(
      '{ "semi": true }\n',
    )
    const after = JSON.parse(await readFile(pkgPath, 'utf8'))
    expect(after.scripts.test).toBe('node --test')
    // Scripts the project did not have are still added.
    expect(after.scripts['test:watch']).toBe('vitest')
    expect(notes).toEqual([
      'The "test" script already exists ("node --test") and was kept; create-web would set it to "vitest run".',
      'vitest.config.ts already exists and was kept; create-web did not write its own version.',
      '.prettierrc already exists and was kept; create-web did not write its own version.',
    ])
  })

  it('does not report files that already match', async () => {
    const base: ProjectOptions = { ...lynn, features: ['prettier'] }
    await (await generate({ root, mode: 'create', options: base })).fs.commit()

    const { notes } = await generate({
      root,
      mode: 'add',
      options: { ...base, features: ['oxlint'] },
      existing: [],
    })
    expect(notes).toEqual([])
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

describe('oxlint and oxfmt', () => {
  const ox: ProjectOptions = {
    ...lynn,
    features: ['oxlint', 'eslint', 'oxfmt', 'vitest'],
  }

  it('configures oxlint, oxfmt and ESLint to work together', async () => {
    const { fs } = await generate({ root, mode: 'create', options: ox })
    const pkg = JSON.parse((await fs.read('package.json')) ?? '{}')

    expect(pkg.scripts).toMatchObject({
      lint: 'oxlint && eslint .',
      format: 'oxfmt',
      'format:check': 'oxfmt --check',
    })
    expect(pkg.devDependencies).toHaveProperty('eslint-plugin-oxlint')
    expect(pkg.devDependencies).toHaveProperty('eslint-config-prettier')
    expect(pkg.devDependencies).not.toHaveProperty('prettier')
    expect(fs.changedPaths()).not.toContain('.prettierrc')
    expect(
      JSON.parse((await fs.read('.oxlintrc.json')) ?? '{}').plugins,
    ).toEqual(['eslint', 'typescript', 'unicorn', 'oxc', 'vue', 'vitest'])
    const eslintConfig = await fs.read('eslint.config.js')
    expect(eslintConfig).toContain(
      "buildFromOxlintConfigFile('./.oxlintrc.json')",
    )
    expect(eslintConfig).toContain('skipFormatting')
  })

  it('records hashes of generated config files in the manifest', async () => {
    const { fs } = await generate({ root, mode: 'create', options: ox })
    const manifest = JSON.parse((await fs.read('.create-web.json')) ?? '{}')
    expect(Object.keys(manifest.generated)).toEqual([
      '.oxlintrc.json',
      'eslint.config.js',
    ])
  })

  it('updates an unedited ESLint config when oxlint is added later', async () => {
    const base: ProjectOptions = { ...lynn, features: ['eslint', 'prettier'] }
    await (await generate({ root, mode: 'create', options: base })).fs.commit()

    const { fs, notes } = await generate({
      root,
      mode: 'add',
      options: { ...base, features: ['oxlint'] },
      existing: base.features,
    })
    await fs.commit()

    expect(notes).toEqual([])
    expect(await readFile(join(root, 'eslint.config.js'), 'utf8')).toContain(
      'pluginOxlint',
    )
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    expect(pkg.scripts.lint).toBe('oxlint && eslint .')
    expect(pkg.devDependencies).toHaveProperty('eslint-plugin-oxlint')
  })

  it('leaves an edited ESLint config alone and reports what to add', async () => {
    const base: ProjectOptions = { ...lynn, features: ['eslint'] }
    await (await generate({ root, mode: 'create', options: base })).fs.commit()
    const configPath = join(root, 'eslint.config.js')
    await writeFile(
      configPath,
      `${await readFile(configPath, 'utf8')}// custom\n`,
    )

    const { fs, notes } = await generate({
      root,
      mode: 'add',
      options: { ...base, features: ['oxlint'] },
      existing: base.features,
    })
    await fs.commit()

    expect(await readFile(configPath, 'utf8')).toContain('// custom')
    expect(await readFile(configPath, 'utf8')).not.toContain('pluginOxlint')
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('buildFromOxlintConfigFile')
  })

  it('keeps protecting an edited config on later runs', async () => {
    const base: ProjectOptions = { ...lynn, features: ['eslint'] }
    await (await generate({ root, mode: 'create', options: base })).fs.commit()
    const configPath = join(root, 'eslint.config.js')
    await writeFile(
      configPath,
      `${await readFile(configPath, 'utf8')}// custom\n`,
    )

    for (const [feature, existing] of [
      ['oxlint', ['eslint']],
      ['prettier', ['eslint', 'oxlint']],
    ] as const) {
      const { fs, notes } = await generate({
        root,
        mode: 'add',
        options: { ...base, features: [feature] },
        existing: [...existing],
      })
      await fs.commit()
      expect(notes).toHaveLength(1)
    }

    expect(await readFile(configPath, 'utf8')).toContain('// custom')
  })
})

describe('generate (create, library)', () => {
  const library: ProjectOptions = {
    name: '@scope/demo-lib',
    kind: 'library',
    packageManager: 'pnpm',
    features: presetFeatures(presets.lynn, 'library'),
  }

  it('produces the expected files for the lynn preset', async () => {
    const { fs, notes } = await generate({
      root,
      mode: 'create',
      options: library,
    })
    expect(notes).toHaveLength(2)
    expect(fs.changedPaths()).toMatchSnapshot()
  })

  it('writes a publishable package.json', async () => {
    const { fs } = await generate({ root, mode: 'create', options: library })
    const pkg = JSON.parse((await fs.read('package.json')) ?? '{}')
    expect(pkg).toMatchObject({
      name: '@scope/demo-lib',
      files: ['dist'],
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      },
      publishConfig: { access: 'public' },
    })
    expect(pkg.scripts.prepublishOnly).toBe('pnpm run build')
    expect(await fs.read('eslint.config.js')).toContain('globals.node')
    expect(await fs.read('AGENTS.md')).toContain(
      '`pnpm run dev`: rebuild on change',
    )
    expect(await fs.read('.github/workflows/publish.yml')).toContain(
      'npm publish',
    )
  })

  it('rejects frontend-only features and frameworks', async () => {
    await expect(
      generate({
        root,
        mode: 'create',
        options: { ...library, features: ['tailwind'] },
      }),
    ).rejects.toThrow(/does not support library/)
    await expect(
      generate({
        root,
        mode: 'create',
        options: { ...library, framework: 'vue' },
      }),
    ).rejects.toThrow(/do not use a framework/)
  })
})
