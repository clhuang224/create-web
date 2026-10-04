import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { templatesDir } from '../paths.ts'
import { compatibleFeatures, type Preset, presetFeatures } from '../presets.ts'
import { formatSource } from './format.ts'
import {
  type GenerateInput,
  type GenerateResult,
  generate,
} from './generate.ts'
import { MANIFEST_PATH, type Manifest, readManifest } from './manifest.ts'
import { PackageJsonEditor } from './package-json.ts'
import { ResolveError } from './resolver.ts'
import type { FeatureId, Framework, ProjectOptions } from './types.ts'
import { VirtualFs } from './vfs.ts'

export interface MemberSpec {
  /** Directory and package name suffix, e.g. `web` → apps/web, @repo/web. */
  name: string
  kind: 'frontend' | 'library'
  framework?: Framework
  features: FeatureId[]
}

export interface WorkspaceResult {
  /** Relative path of the project ('' for the root) with its generation result. */
  projects: { path: string; result: GenerateResult }[]
}

export function memberPath(spec: Pick<MemberSpec, 'name' | 'kind'>) {
  return `${spec.kind === 'library' ? 'packages' : 'apps'}/${spec.name}`
}

/** Members are scoped under the root name, like `@repo/web`. */
export function memberPackageName(rootName: string, memberName: string) {
  const scope = rootName.replace(/^@/, '').split('/')[0]
  return `@${scope}/${memberName}`
}

/** Features a workspace member can use itself (not owned by the root, not standalone-only). */
export function memberCandidates(
  kind: MemberSpec['kind'],
  framework?: Framework,
) {
  const rootCapable = new Set(
    compatibleFeatures('monorepo').map((feature) => feature.id),
  )
  return compatibleFeatures(kind, framework).filter(
    (feature) => !rootCapable.has(feature.id) && !feature.standaloneOnly,
  )
}

/** A preset's features for a monorepo: the root plus every member, minus standalone-only ones. */
export function workspacePresetFeatures(
  preset: Preset,
  members: Omit<MemberSpec, 'features'>[],
): FeatureId[] {
  const standaloneOnly = new Set(
    compatibleFeatures('frontend')
      .concat(compatibleFeatures('library'))
      .filter((feature) => feature.standaloneOnly)
      .map((feature) => feature.id),
  )
  return [
    ...new Set([
      ...presetFeatures(preset, 'monorepo'),
      ...members.flatMap((member) =>
        presetFeatures(preset, member.kind, member.framework),
      ),
    ]),
  ].filter((id) => !standaloneOnly.has(id))
}

/**
 * Splits one feature list between the root (formatter, hooks, CI, docs) and
 * each member (linters, tests, framework features).
 */
export function splitWorkspaceFeatures(
  features: FeatureId[],
  members: Omit<MemberSpec, 'features'>[],
) {
  const rootCapable = new Set(
    compatibleFeatures('monorepo').map((feature) => feature.id),
  )
  const memberFeatures = (member: Omit<MemberSpec, 'features'>) =>
    memberCandidates(member.kind, member.framework)
      .map((feature) => feature.id)
      .filter((id) => features.includes(id))

  const assigned = new Set([
    ...rootCapable,
    ...members.flatMap((member) => memberFeatures(member)),
  ])
  const unassigned = features.filter((id) => !assigned.has(id))
  if (unassigned.length > 0) {
    throw new ResolveError(
      `Not available in this monorepo: ${unassigned.join(', ')}`,
    )
  }

  return {
    root: features.filter((id) => rootCapable.has(id)),
    members: members.map((member) => ({
      ...member,
      features: memberFeatures(member),
    })),
  }
}

export async function generateWorkspace({
  root,
  options,
  members,
}: {
  root: string
  options: ProjectOptions
  members: MemberSpec[]
}): Promise<WorkspaceResult> {
  const names = members.map((member) => member.name)
  const duplicate = names.find((name, index) => names.indexOf(name) !== index)
  if (duplicate) throw new ResolveError(`Duplicate project name: ${duplicate}`)
  for (const name of names) {
    const error = await reservedMemberNameError(name)
    if (error) throw new ResolveError(error)
  }

  const rootResult = await generate({
    root,
    mode: 'create',
    options,
    members: members.map(memberPath),
  })
  const projects = [{ path: '', result: rootResult }]
  for (const member of members) {
    projects.push({
      path: memberPath(member),
      // Pass the resolved root features, which include auto-required ones.
      result: await generateMember(
        root,
        { ...options, features: rootResult.applied },
        member,
      ),
    })
  }
  return { projects }
}

export async function generateMember(
  workspaceRoot: string,
  rootOptions: Pick<ProjectOptions, 'name' | 'packageManager' | 'features'>,
  member: MemberSpec,
) {
  return generate({
    root: join(workspaceRoot, memberPath(member)),
    mode: 'create',
    options: {
      name: memberPackageName(rootOptions.name, member.name),
      kind: member.kind,
      framework: member.framework,
      packageManager: rootOptions.packageManager,
      features: member.features,
    },
    workspace: { rootFeatures: rootOptions.features },
  })
}

/** Records a new member in the root manifest; returns the root fs to commit. */
export async function recordMember(workspaceRoot: string, path: string) {
  const fs = new VirtualFs(workspaceRoot)
  const manifest = await readManifest(fs)
  if (!manifest)
    throw new ResolveError(`No ${MANIFEST_PATH} at ${workspaceRoot}`)
  const next: Manifest = {
    ...manifest,
    members: [...new Set([...(manifest.members ?? []), path])].sort(),
  }
  fs.write(
    MANIFEST_PATH,
    await formatSource(MANIFEST_PATH, `${JSON.stringify(next, null, 2)}\n`),
  )
  return fs
}

/**
 * Directory names the monorepo root cannot hold a member under: the generated
 * root `.gitignore` ignores them (e.g. `dist`, `coverage`), and package
 * managers treat `node_modules` as their own.
 */
export async function reservedMemberNameError(name: string) {
  const gitignore = await readFile(
    join(templatesDir, 'monorepo', '_gitignore'),
    'utf8',
  )
  const patterns = [
    'node_modules',
    ...gitignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')),
  ]
  return patterns.some((pattern) => globMatches(pattern, name))
    ? `"${name}" cannot be a project name: the monorepo ignores directories with that name.`
    : undefined
}

function globMatches(pattern: string, name: string) {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*')
  return new RegExp(`^${source}$`).test(name)
}

/**
 * Checks that a new member's name is free before anything is written: not
 * reserved, not the directory name of an existing member, and not the package
 * name of a project the package manager would also match with `--filter`.
 */
export async function assertNewMember(
  workspaceRoot: string,
  rootManifest: Manifest,
  rootName: string,
  name: string,
) {
  const reserved = await reservedMemberNameError(name)
  if (reserved) throw new ResolveError(reserved)
  const members = rootManifest.members ?? []
  const sameName = members.find((path) => path.split('/').pop() === name)
  if (sameName) {
    throw new ResolveError(`${sameName} already uses the name "${name}".`)
  }
  const packageName = memberPackageName(rootName, name)
  const paths = new Set([
    ...members,
    memberPath({ name, kind: 'frontend' }),
    memberPath({ name, kind: 'library' }),
  ])
  for (const path of paths) {
    if ((await readPackageName(join(workspaceRoot, path))) === packageName) {
      throw new ResolveError(`${path} is already named ${packageName}.`)
    }
  }
}

/** The package name in `dir`, or undefined when it has no readable package.json. */
async function readPackageName(dir: string) {
  let raw: string
  try {
    raw = await readFile(join(dir, 'package.json'), 'utf8')
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : ''
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined
    throw error
  }
  try {
    const { name } = JSON.parse(raw) as { name?: unknown }
    return typeof name === 'string' ? name : undefined
  } catch {
    // An unparsable package.json is not a project the package manager matches.
    return undefined
  }
}

/** The monorepo a member belongs to; members live at apps/<name> or packages/<name>. */
export async function findWorkspaceRoot(projectRoot: string) {
  const root = resolve(projectRoot, '..', '..')
  const manifest = await readManifest(new VirtualFs(root))
  return manifest?.kind === 'monorepo' ? { root, manifest } : undefined
}

/**
 * The `workspace` input for generating in an existing project: the root's
 * features as they are now, or undefined if the project is not a member.
 */
export async function memberWorkspace(
  projectRoot: string,
  manifest: Manifest,
): Promise<GenerateInput['workspace']> {
  if (!manifest.workspace) return undefined
  const workspace = await findWorkspaceRoot(projectRoot)
  return {
    // Without a monorepo root above it (e.g. the member was moved), fall back
    // to the copy older versions stored in the member's manifest.
    rootFeatures:
      workspace?.manifest.features ?? manifest.workspace.inherited ?? [],
  }
}

/**
 * Re-runs every member's `sync` hooks against the root's current features, so
 * files derived from them follow root changes (e.g. ESLint's `skipFormatting`
 * after a formatter is added or removed at the root). Nothing is written to
 * disk; files that would not change are left out of each result.
 */
export async function syncMembers(
  workspaceRoot: string,
  members: string[],
  rootFeatures: FeatureId[],
): Promise<WorkspaceResult['projects']> {
  const projects: WorkspaceResult['projects'] = []
  for (const path of members) {
    const root = join(workspaceRoot, path)
    const disk = new VirtualFs(root)
    const manifest = await readManifest(disk)
    if (!manifest) {
      projects.push({
        path,
        result: {
          fs: disk,
          features: [],
          applied: [],
          removed: [],
          notes: [
            `no ${MANIFEST_PATH} found, so it was not updated for the root's features.`,
          ],
        },
      })
      continue
    }
    const { name = path } = (await PackageJsonEditor.load(disk)).data
    const result = await generate({
      root,
      mode: 'add',
      options: {
        name,
        kind: manifest.kind,
        framework: manifest.framework,
        packageManager: manifest.packageManager,
        features: [],
        pagesDomain: manifest.pagesDomain,
      },
      existing: manifest.features,
      workspace: { rootFeatures },
    })
    await result.fs.dropUnchanged()
    projects.push({ path, result })
  }
  return projects
}
