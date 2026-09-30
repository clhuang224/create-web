import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { presets } from '../presets.ts'
import { generate } from './generate.ts'
import type { ProjectOptions } from './types.ts'
import {
  generateMember,
  generateWorkspace,
  memberPackageName,
  recordMember,
  splitWorkspaceFeatures,
  workspacePresetFeatures,
} from './workspace.ts'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'create-web-workspace-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const members = [
  { name: 'web', kind: 'frontend', framework: 'vue' },
  { name: 'shared', kind: 'library' },
] as const

const allFeatures = workspacePresetFeatures(presets.lynn, [...members])

const rootOptions = (features: ProjectOptions['features']): ProjectOptions => ({
  name: 'demo',
  kind: 'monorepo',
  packageManager: 'pnpm',
  features,
})

async function createWorkspace() {
  const split = splitWorkspaceFeatures(allFeatures, [...members])
  const result = await generateWorkspace({
    root,
    options: rootOptions(split.root),
    members: split.members,
  })
  for (const { result: project } of result.projects) await project.fs.commit()
  return result
}

const readJson = async (path: string) =>
  JSON.parse(await readFile(join(root, path), 'utf8'))

describe('splitWorkspaceFeatures', () => {
  it('keeps shared tooling at the root and project tooling in members', () => {
    const split = splitWorkspaceFeatures(allFeatures, [...members])
    expect(split.root).toEqual([
      'prettier',
      'husky',
      'github-actions',
      'agent-docs',
    ])
    expect(split.members[0]?.features).toEqual([
      'pinia',
      'vue-router',
      'tailwind',
      'vitest',
      'eslint',
    ])
    expect(split.members[1]?.features).toEqual(['vitest', 'eslint'])
  })

  it('rejects features no project can use', () => {
    expect(() =>
      splitWorkspaceFeatures(['github-pages'], [...members]),
    ).toThrow(/Not available in this monorepo: github-pages/)
  })
})

describe('generateWorkspace', () => {
  it('lays out the root and members', async () => {
    const { projects } = await createWorkspace()
    expect(projects.map((project) => project.path)).toEqual([
      '',
      'apps/web',
      'packages/shared',
    ])

    expect(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(
      'packages:\n  - apps/*\n  - packages/*\n',
    )
    const rootPkg = await readJson('package.json')
    expect(rootPkg.scripts.lint).toBe('pnpm -r --if-present run lint')
    expect(rootPkg.devDependencies).toHaveProperty('prettier')
    expect(rootPkg.devDependencies).not.toHaveProperty('eslint')
    expect((await readJson('.create-web.json')).members).toEqual([
      'apps/web',
      'packages/shared',
    ])
  })

  it('gives members scoped names and leaves shared files to the root', async () => {
    const { projects } = await createWorkspace()
    const web = projects[1]?.result.fs
    expect(web?.changedPaths()).not.toContain('.gitignore')
    expect(web?.changedPaths()).not.toContain('.husky/pre-commit')

    const webPkg = await readJson('apps/web/package.json')
    expect(webPkg.name).toBe('@demo/web')
    expect(webPkg).not.toHaveProperty('packageManager')
    expect(webPkg.devDependencies).not.toHaveProperty('prettier')
    // The root formatter still switches off ESLint's stylistic rules.
    expect(
      await readFile(join(root, 'apps/web/eslint.config.js'), 'utf8'),
    ).toContain('skipFormatting')
    expect((await readJson('apps/web/.create-web.json')).workspace).toEqual({
      inherited: ['prettier', 'husky', 'github-actions', 'agent-docs'],
    })
    expect((await readJson('packages/shared/package.json')).name).toBe(
      '@demo/shared',
    )
  })

  it('writes a workspace section into the root AGENTS.md', async () => {
    await createWorkspace()
    const agents = await readFile(join(root, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('## Workspace Layout')
    expect(agents).toContain('pnpm --filter <name> <script>')
  })

  it('rejects root features inside a member', async () => {
    await expect(
      generate({
        root: join(root, 'apps/web'),
        mode: 'create',
        options: {
          name: '@demo/web',
          kind: 'frontend',
          framework: 'vue',
          packageManager: 'pnpm',
          features: ['husky'],
        },
        workspace: { inherited: [] },
      }),
    ).rejects.toThrow(/set up at the workspace root/)
  })

  it('adds a member later and records it at the root', async () => {
    await createWorkspace()
    const result = await generateMember(root, rootOptions(['prettier']), {
      name: 'admin',
      kind: 'frontend',
      framework: 'react',
      features: ['eslint'],
    })
    await result.fs.commit()
    await (await recordMember(root, 'apps/admin')).commit()

    expect((await readJson('apps/admin/package.json')).name).toBe('@demo/admin')
    expect((await readJson('.create-web.json')).members).toEqual([
      'apps/admin',
      'apps/web',
      'packages/shared',
    ])
  })

  it('uses package.json workspaces with bun', async () => {
    const result = await generate({
      root,
      mode: 'create',
      options: { ...rootOptions([]), packageManager: 'bun' },
    })
    const pkg = JSON.parse((await result.fs.read('package.json')) ?? '{}')
    expect(pkg.workspaces).toEqual(['apps/*', 'packages/*'])
    expect(pkg.scripts.build).toBe("bun run --filter '*' build")
    expect(result.fs.changedPaths()).not.toContain('pnpm-workspace.yaml')
  })

  it('keeps the member list when adding root features later', async () => {
    await createWorkspace()
    const { fs } = await generate({
      root,
      mode: 'add',
      options: rootOptions([
        'prettier',
        'husky',
        'github-actions',
        'agent-docs',
      ]),
      existing: ['prettier', 'husky', 'github-actions', 'agent-docs'],
    })
    await fs.commit()
    expect((await readJson('.create-web.json')).members).toEqual([
      'apps/web',
      'packages/shared',
    ])
  })
})

describe('memberPackageName', () => {
  it('scopes under the root name', () => {
    expect(memberPackageName('repo', 'web')).toBe('@repo/web')
    expect(memberPackageName('@org/repo', 'web')).toBe('@org/web')
  })
})
