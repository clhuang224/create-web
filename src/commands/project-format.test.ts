import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generate } from '../core/generate.ts'
import { hashContent, type Manifest } from '../core/manifest.ts'
import { VirtualFs } from '../core/vfs.ts'
import {
  formattableFiles,
  formatterOf,
  refreshGeneratedHashes,
} from './project-format.ts'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'create-web-format-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const manifest = (partial: Partial<Manifest>): Manifest => ({
  version: '0.0.0',
  kind: 'frontend',
  packageManager: 'pnpm',
  features: [],
  ...partial,
})

describe('formatterOf', () => {
  it('uses the formatter the project or its workspace root has', () => {
    expect(formatterOf(manifest({ features: ['oxfmt'] }))).toBe('oxfmt')
    expect(formatterOf(manifest({ features: ['prettier'] }))).toBe('prettier')
    expect(
      formatterOf(manifest({ workspace: { inherited: ['prettier'] } })),
    ).toBe('prettier')
    expect(formatterOf(manifest({ features: ['eslint'] }))).toBeUndefined()
  })
})

describe('formattableFiles', () => {
  it('lists written files a formatter understands, relative to the root', async () => {
    const fs = new VirtualFs(root)
    fs.write('src/main.ts', '')
    fs.write('.husky/pre-commit', '')
    fs.write('AGENTS.md', '')
    fs.write('.oxfmtrc.json', '')
    fs.delete('.prettierrc')

    expect(await formattableFiles([{ dir: 'apps/web', fs }])).toEqual([
      'apps/web/.oxfmtrc.json',
      'apps/web/src/main.ts',
    ])
  })
})

describe('refreshGeneratedHashes', () => {
  it('re-hashes only generated files this run wrote', async () => {
    await (
      await generate({
        root,
        mode: 'create',
        options: {
          name: 'demo',
          kind: 'frontend',
          framework: 'vue',
          packageManager: 'pnpm',
          features: ['eslint', 'oxlint'],
        },
      })
    ).fs.commit()
    // Simulate the project's formatter changing one generated file and the
    // user editing another.
    const eslintConfig = join(root, 'eslint.config.js')
    const formatted = `${await readFile(eslintConfig, 'utf8')}\n`
    await writeFile(eslintConfig, formatted)
    await writeFile(join(root, '.oxlintrc.json'), '{}\n')
    const before = JSON.parse(
      await readFile(join(root, '.create-web.json'), 'utf8'),
    ).generated

    const fs = await refreshGeneratedHashes(root, ['eslint.config.js'])
    await fs.commit()

    const after = JSON.parse(
      await readFile(join(root, '.create-web.json'), 'utf8'),
    ).generated
    expect(after['eslint.config.js']).toBe(hashContent(formatted))
    expect(after['.oxlintrc.json']).toBe(before['.oxlintrc.json'])
  })
})
