import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { presetFeatures, presets } from '../presets.ts'
import { generate } from './generate.ts'
import { MANIFEST_PATH, readManifest } from './manifest.ts'
import { type PackageJson, PackageJsonEditor } from './package-json.ts'
import type { FeatureId, ProjectOptions } from './types.ts'
import { VirtualFs } from './vfs.ts'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'create-web-remove-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const lynn: ProjectOptions = {
  name: 'demo',
  kind: 'frontend',
  framework: 'vue',
  packageManager: 'pnpm',
  features: presetFeatures(presets.lynn, 'frontend', 'vue'),
}

const read = (path: string) => readFile(join(root, path), 'utf8')
const readJson = async (path: string) => JSON.parse(await read(path))
const exists = (path: string) =>
  stat(join(root, path)).then(
    () => true,
    () => false,
  )

async function create(options: ProjectOptions = lynn) {
  await (await generate({ root, mode: 'create', options })).fs.commit()
}

async function editPackageJson(edit: (pkg: PackageJson) => void) {
  const pkg = (await readJson('package.json')) as PackageJson
  edit(pkg)
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2))
}

async function currentFeatures() {
  return (await readManifest(new VirtualFs(root)))?.features ?? []
}

async function run(
  mode: 'add' | 'remove',
  ids: FeatureId[],
  options: ProjectOptions = lynn,
) {
  const existing = await currentFeatures()
  const result = await generate({
    root,
    mode,
    options: { ...options, features: mode === 'add' ? ids : [] },
    existing,
    remove: mode === 'remove' ? ids : undefined,
  })
  await result.fs.commit()
  return result
}

describe('remove', () => {
  it('removes Prettier and updates everything that referred to it', async () => {
    await create()
    const { notes, removed } = await run('remove', ['prettier'])

    expect(removed).toEqual(['prettier'])
    expect(notes).toEqual([])
    expect(await exists('.prettierrc')).toBe(false)
    expect(await exists('.prettierignore')).toBe(false)
    const pkg = await readJson('package.json')
    expect(pkg.devDependencies).not.toHaveProperty('prettier')
    expect(pkg.devDependencies).not.toHaveProperty('eslint-config-prettier')
    expect(pkg.scripts).not.toHaveProperty('format')
    expect(pkg.scripts).not.toHaveProperty('format:check')
    expect(await read('eslint.config.js')).not.toContain('skipFormatting')
    expect(await read('.husky/pre-commit')).not.toContain('format:check')
    expect(await read('.github/workflows/ci.yml')).not.toContain(
      "'format:check'",
    )
    expect(await read('AGENTS.md')).not.toContain('pnpm run format')
    expect(await currentFeatures()).not.toContain('prettier')
  })

  it('swaps Prettier for oxfmt', async () => {
    await create()
    await run('remove', ['prettier'])
    await run('add', ['oxfmt'])

    const pkg = await readJson('package.json')
    expect(pkg.scripts['format:check']).toBe('oxfmt --check')
    expect(await exists('.oxfmtrc.json')).toBe(true)
    expect(await read('eslint.config.js')).toContain('skipFormatting')
    expect(await read('.husky/pre-commit')).toContain('pnpm run format:check')
  })

  it('removes the last linter together with the lint script', async () => {
    await create()
    await run('remove', ['eslint'])

    const pkg = await readJson('package.json')
    expect(pkg.scripts).not.toHaveProperty('lint')
    expect(pkg.devDependencies).not.toHaveProperty('eslint')
    expect(pkg.devDependencies).not.toHaveProperty('eslint-plugin-vue')
    expect(await exists('eslint.config.js')).toBe(false)
    expect(await read('.husky/pre-commit')).not.toContain('pnpm run lint')
  })

  it('keeps ESLint and switches the lint script when oxlint is removed', async () => {
    await create({ ...lynn, features: ['oxlint', 'eslint'] })
    await run('remove', ['oxlint'])

    const pkg = await readJson('package.json')
    expect(pkg.scripts.lint).toBe('eslint .')
    expect(pkg.devDependencies).not.toHaveProperty('eslint-plugin-oxlint')
    expect(await read('eslint.config.js')).not.toContain('pluginOxlint')
    expect(await exists('.oxlintrc.json')).toBe(false)
  })

  it('removes Vitest files, scripts and the tsconfig reference', async () => {
    await create()
    await run('remove', ['vitest'])

    expect(await exists('vitest.config.ts')).toBe(false)
    expect(await exists('tsconfig.vitest.json')).toBe(false)
    expect(await exists('src/components/__tests__/HelloWorld.spec.ts')).toBe(
      false,
    )
    expect((await readJson('tsconfig.json')).references).not.toContainEqual({
      path: './tsconfig.vitest.json',
    })
    expect((await readJson('package.json')).scripts).not.toHaveProperty('test')
    expect(await read('.husky/pre-push')).not.toContain('pnpm run test')
  })

  it('keeps edited files and scripts, with notes', async () => {
    await create()
    await writeFile(join(root, '.prettierrc'), '{ "semi": true }\n')
    const pkg = await readJson('package.json')
    pkg.scripts.format = 'prettier --write src'
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2))

    const { notes } = await run('remove', ['prettier'])

    expect(await read('.prettierrc')).toBe('{ "semi": true }\n')
    expect((await readJson('package.json')).scripts.format).toBe(
      'prettier --write src',
    )
    expect(notes).toEqual([
      'The "format" script was changed ("prettier --write src"), so it was kept.',
      '.prettierrc was changed, so it was kept; delete it yourself if it is no longer needed.',
      'Kept prettier because the "format" script and .prettierrc were kept and may still use it; uninstall it once nothing does.',
    ])
    expect((await readJson('package.json')).devDependencies).toHaveProperty(
      'prettier',
    )
  })

  it('keeps ESLint installed when its edited config is kept', async () => {
    await create()
    await writeFile(
      join(root, 'eslint.config.js'),
      `${await read('eslint.config.js')}// my rules\n`,
    )

    const { notes } = await run('remove', ['eslint'])

    expect(await read('eslint.config.js')).toContain('// my rules')
    const pkg = await readJson('package.json')
    expect(pkg.devDependencies).toHaveProperty('eslint')
    expect(pkg.devDependencies).toHaveProperty('eslint-plugin-vue')
    expect(pkg.devDependencies).toHaveProperty('eslint-config-prettier')
    expect(notes).toContain(
      'Kept eslint, eslint-plugin-vue, @vue/eslint-config-typescript, eslint-config-prettier because eslint.config.js was kept and may still use them; uninstall them once nothing does.',
    )
  })

  it('keeps Vitest installed when the test script still runs it', async () => {
    await create()
    await editPackageJson((pkg) => {
      pkg.scripts = { ...pkg.scripts, test: 'vitest run --passWithNoTests' }
    })

    const { notes } = await run('remove', ['vitest'])

    const pkg = await readJson('package.json')
    expect(pkg.scripts.test).toBe('vitest run --passWithNoTests')
    expect(pkg.devDependencies).toHaveProperty('vitest')
    expect(pkg.devDependencies).toHaveProperty('jsdom')
    expect(await read('.husky/pre-push')).toContain('pnpm run test')
    expect(notes).toContain(
      'Kept vitest, @vue/test-utils, jsdom, @types/jsdom because the "test" script was kept and may still use them; uninstall them once nothing does.',
    )
  })
})

describe('remove (dependency ownership)', () => {
  const vue: ProjectOptions = { ...lynn, features: [] }
  const react: ProjectOptions = { ...lynn, framework: 'react', features: [] }

  async function ownedDependencies() {
    return (await readManifest(new VirtualFs(root)))?.ownedDependencies
  }

  it('records the dependencies it adds in the manifest', async () => {
    await create({ ...vue, features: ['husky'] })
    const owned = await ownedDependencies()
    expect(owned?.dependencies).toEqual(['vue'])
    expect(owned?.devDependencies).toContain('husky')
    expect(owned?.devDependencies).toContain('vite')

    await run('remove', ['husky'], vue)
    expect((await ownedDependencies())?.devDependencies).not.toContain('husky')
  })

  it('leaves dependencies the user added alone', async () => {
    await create(vue)
    await editPackageJson((pkg) => {
      pkg.dependencies = { ...pkg.dependencies, globals: '^16.0.0' }
    })
    await run('add', ['eslint'], vue)
    await run('remove', ['eslint'], vue)

    const pkg = await readJson('package.json')
    expect(pkg.dependencies.globals).toBe('^16.0.0')
    expect(pkg.devDependencies).not.toHaveProperty('eslint')
    expect(pkg.devDependencies).not.toHaveProperty('eslint-plugin-vue')
  })

  it('does not take over a dependency the project already had', async () => {
    await create(react)
    await editPackageJson((pkg) => {
      pkg.devDependencies = { ...pkg.devDependencies, globals: '^16.0.0' }
    })
    await run('add', ['eslint'], react)
    expect((await readJson('package.json')).devDependencies.globals).toBe(
      '^16.0.0',
    )
    expect((await ownedDependencies())?.devDependencies).not.toContain(
      'globals',
    )

    await run('remove', ['eslint'], react)
    const pkg = await readJson('package.json')
    expect(pkg.devDependencies.globals).toBe('^16.0.0')
    expect(pkg.devDependencies).not.toHaveProperty('typescript-eslint')
  })

  it('only removes from the section create-web added to', async () => {
    await create({ ...vue, features: ['eslint'] })
    // The user moved a dependency create-web added.
    await editPackageJson((pkg) => {
      const { eslint, ...rest } = pkg.devDependencies ?? {}
      pkg.devDependencies = rest
      pkg.dependencies = { ...pkg.dependencies, eslint: eslint ?? '' }
    })
    await run('remove', ['eslint'], vue)

    const pkg = await readJson('package.json')
    expect(pkg.dependencies).toHaveProperty('eslint')
    expect(pkg.devDependencies).not.toHaveProperty('eslint-plugin-vue')
  })

  it("falls back to the feature's own devDependencies for older manifests", async () => {
    await create({ ...vue, features: ['eslint', 'prettier'] })
    const manifest = await readJson(MANIFEST_PATH)
    delete manifest.ownedDependencies
    await writeFile(join(root, MANIFEST_PATH), JSON.stringify(manifest))
    await editPackageJson((pkg) => {
      const { 'eslint-config-prettier': moved, ...rest } =
        pkg.devDependencies ?? {}
      pkg.devDependencies = { ...rest, 'typescript-eslint': '^8.0.0' }
      pkg.dependencies = {
        ...pkg.dependencies,
        'eslint-config-prettier': moved ?? '',
      }
    })

    await run('remove', ['eslint'], vue)

    const pkg = await readJson('package.json')
    expect(pkg.devDependencies).not.toHaveProperty('eslint')
    expect(pkg.devDependencies).not.toHaveProperty('eslint-plugin-vue')
    // Not something ESLint adds to Vue projects.
    expect(pkg.devDependencies).toHaveProperty('typescript-eslint')
    // The fallback never touches dependencies.
    expect(pkg.dependencies).toHaveProperty('eslint-config-prettier')
    expect(await ownedDependencies()).toBeUndefined()
  })

  it('puts back a dependency a remaining feature adds again', () => {
    const pkg = new PackageJsonEditor(
      { devDependencies: { shared: '1.2.3', other: '1.0.0' } },
      undefined,
      { devDependencies: ['other', 'shared'] },
    )
    pkg.removeDependencies(['shared'])
    pkg.addDevDependencies({ shared: '^2.0.0' })

    expect(pkg.data.devDependencies).toEqual({
      other: '1.0.0',
      shared: '1.2.3',
    })
    expect(pkg.ownedDependencies()).toEqual({
      devDependencies: ['other', 'shared'],
    })
  })

  it('refuses to remove what another feature requires', async () => {
    await create()
    await expect(run('remove', ['github-actions'])).rejects.toThrow(
      '"github-actions" is required by "github-pages"; remove "github-pages" as well',
    )
    const { removed } = await run('remove', ['github-pages', 'github-actions'])
    expect(removed).toEqual(['github-actions', 'github-pages'])
    expect(await exists('.github/workflows/ci.yml')).toBe(false)
    expect(await exists('.github/workflows/deploy.yml')).toBe(false)
  })

  it('refuses features it cannot remove yet or that are not applied', async () => {
    await create()
    await expect(run('remove', ['pinia'])).rejects.toThrow(
      '"pinia" cannot be removed automatically yet',
    )
    await expect(run('remove', ['oxfmt'])).rejects.toThrow(
      '"oxfmt" is not part of this project',
    )
  })

  it('removes husky hooks and reminds about the hooks path', async () => {
    await create()
    const { notes } = await run('remove', ['husky'])

    expect(await exists('.husky/pre-commit')).toBe(false)
    expect(await exists('.husky/commit-msg')).toBe(false)
    expect((await readJson('package.json')).scripts).not.toHaveProperty(
      'prepare',
    )
    expect(notes).toEqual([
      'Run `git config --unset core.hooksPath` and delete .husky/_ so Git stops looking for husky hooks.',
    ])
  })
})
