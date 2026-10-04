import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { presets } from '../presets.ts'
import { generate } from './generate.ts'
import type { ProjectOptions } from './types.ts'
import { readManifest } from './manifest.ts'
import { VirtualFs } from './vfs.ts'
import {
  assertNewMember,
  generateMember,
  generateWorkspace,
  memberPackageName,
  memberWorkspace,
  recordMember,
  splitWorkspaceFeatures,
  syncMembers,
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
    // Only a marker: the root's features are read from the root at run time.
    expect((await readJson('apps/web/.create-web.json')).workspace).toEqual({})
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
        workspace: { rootFeatures: [] },
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
    expect(pkg.scripts.build).toBe("bun run --filter '*' --if-present build")
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

const readText = (path: string) => readFile(join(root, path), 'utf8')

/** Changes root features the way `add` / `remove` at the root does, member sync included. */
async function changeRootFeatures(change: {
  add?: ProjectOptions['features']
  remove?: ProjectOptions['features']
}) {
  const manifest = await readManifest(new VirtualFs(root))
  if (!manifest) throw new Error('expected a root manifest')
  const result = await generate({
    root,
    mode: change.remove ? 'remove' : 'add',
    options: rootOptions(change.add ?? []),
    existing: manifest.features,
    remove: change.remove,
  })
  const members = await syncMembers(
    root,
    manifest.members ?? [],
    result.features,
  )
  await result.fs.commit()
  for (const { result: member } of members) await member.fs.commit()
  return members
}

describe('syncMembers', () => {
  it('updates members when the root formatter changes', async () => {
    await createWorkspace()
    expect(await readText('apps/web/eslint.config.js')).toContain(
      'skipFormatting',
    )

    const removed = await changeRootFeatures({ remove: ['prettier'] })
    expect(removed.map((project) => project.path)).toEqual([
      'apps/web',
      'packages/shared',
    ])
    expect(removed[0]?.result.fs.changedPaths()).toContain('eslint.config.js')
    expect(await readText('apps/web/eslint.config.js')).not.toContain(
      'skipFormatting',
    )
    expect(
      (await readJson('apps/web/package.json')).devDependencies,
    ).not.toHaveProperty('eslint-config-prettier')
    expect(await readText('packages/shared/eslint.config.js')).not.toContain(
      'skipFormatting',
    )

    await changeRootFeatures({ add: ['oxfmt'] })
    expect(await readText('apps/web/eslint.config.js')).toContain(
      'skipFormatting',
    )
    expect((await readJson('apps/web/.create-web.json')).workspace).toEqual({})
  })

  it('leaves members out of the preview when nothing in them changes', async () => {
    await createWorkspace()
    const projects = await syncMembers(
      root,
      ['apps/web', 'packages/shared'],
      ['prettier', 'husky', 'github-actions', 'agent-docs'],
    )
    expect(projects.map(({ result }) => result.fs.changedPaths())).toEqual([
      [],
      [],
    ])
  })

  it('keeps an edited member config and says what to change', async () => {
    await createWorkspace()
    const config = join(root, 'apps/web/eslint.config.js')
    await writeFile(config, `// mine\n${await readFile(config, 'utf8')}`)

    const members = await changeRootFeatures({ remove: ['prettier'] })
    expect(await readText('apps/web/eslint.config.js')).toContain(
      'skipFormatting',
    )
    expect(members[0]?.result.notes.join('\n')).toMatch(
      /eslint\.config\.js was edited.*remove eslint-config-prettier/,
    )
  })

  it('reports members without a manifest instead of failing', async () => {
    await createWorkspace()
    await rm(join(root, 'packages/shared/.create-web.json'))
    const projects = await syncMembers(
      root,
      ['apps/web', 'packages/shared'],
      [],
    )
    expect(projects[1]?.result.notes[0]).toMatch(/no \.create-web\.json/)
  })
})

describe('memberWorkspace', () => {
  it("reads the root's current features, not a stored copy", async () => {
    await createWorkspace()
    await changeRootFeatures({ remove: ['prettier'] })
    // A manifest from an older version still lists the features the root had then.
    const memberRoot = join(root, 'apps/web')
    const legacy = {
      ...(await readJson('apps/web/.create-web.json')),
      workspace: { inherited: ['prettier', 'husky'] },
    }
    await writeFile(
      join(memberRoot, '.create-web.json'),
      JSON.stringify(legacy),
    )

    expect(await memberWorkspace(memberRoot, legacy)).toEqual({
      rootFeatures: ['husky', 'github-actions', 'agent-docs'],
    })
    // Adding a member feature rewrites the manifest with only the marker.
    const { fs } = await generate({
      root: memberRoot,
      mode: 'add',
      options: {
        name: '@demo/web',
        kind: 'frontend',
        framework: 'vue',
        packageManager: 'pnpm',
        features: ['oxlint'],
      },
      existing: legacy.features,
      workspace: await memberWorkspace(memberRoot, legacy),
    })
    expect(
      JSON.parse((await fs.read('.create-web.json')) ?? '{}').workspace,
    ).toEqual({})
    expect(await fs.read('eslint.config.js')).not.toContain('skipFormatting')
  })

  it('is undefined for standalone projects', async () => {
    expect(
      await memberWorkspace(root, {
        version: '0.0.0',
        kind: 'frontend',
        packageManager: 'pnpm',
        features: [],
      }),
    ).toBeUndefined()
  })
})

describe('member names', () => {
  it('rejects names the root ignores', async () => {
    for (const name of ['dist', 'coverage', 'node_modules', 'notes.local']) {
      await expect(
        generateWorkspace({
          root,
          options: rootOptions([]),
          members: [{ name, kind: 'library', features: [] }],
        }),
      ).rejects.toThrow(/cannot be a project name/)
    }
  })

  it('rejects names and package names already in use', async () => {
    await createWorkspace()
    const manifest = await readManifest(new VirtualFs(root))
    if (!manifest) throw new Error('expected a root manifest')
    await expect(
      assertNewMember(root, manifest, 'demo', 'web'),
    ).rejects.toThrow('apps/web already uses the name "web".')
    // A project the manifest does not know about still clashes on its package name.
    await mkdir(join(root, 'apps/ui'), { recursive: true })
    await writeFile(
      join(root, 'apps/ui/package.json'),
      JSON.stringify({ name: '@demo/ui' }),
    )
    await expect(assertNewMember(root, manifest, 'demo', 'ui')).rejects.toThrow(
      'apps/ui is already named @demo/ui.',
    )
    // So does a renamed member.
    const sharedPkg = await readJson('packages/shared/package.json')
    await writeFile(
      join(root, 'packages/shared/package.json'),
      JSON.stringify({ ...sharedPkg, name: '@demo/core' }),
    )
    await expect(
      assertNewMember(root, manifest, 'demo', 'core'),
    ).rejects.toThrow('packages/shared is already named @demo/core.')
    await expect(
      assertNewMember(root, manifest, 'demo', 'admin'),
    ).resolves.toBeUndefined()
  })
})

describe('memberPackageName', () => {
  it('scopes under the root name', () => {
    expect(memberPackageName('repo', 'web')).toBe('@repo/web')
    expect(memberPackageName('@org/repo', 'web')).toBe('@org/web')
  })
})
