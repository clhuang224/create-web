import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { presetFeatures, presets } from '../presets.ts'
import { generate } from './generate.ts'
import { readManifest } from './manifest.ts'
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

async function currentFeatures() {
  return (await readManifest(new VirtualFs(root)))?.features ?? []
}

async function run(mode: 'add' | 'remove', ids: FeatureId[]) {
  const existing = await currentFeatures()
  const result = await generate({
    root,
    mode,
    options: { ...lynn, features: mode === 'add' ? ids : [] },
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
    ])
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
