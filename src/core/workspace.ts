import { join } from 'node:path'
import { compatibleFeatures, type Preset, presetFeatures } from '../presets.ts'
import { formatSource } from './format.ts'
import { type GenerateResult, generate } from './generate.ts'
import { MANIFEST_PATH, type Manifest, readManifest } from './manifest.ts'
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

/** Members are scoped under the root name, like `@bus/web`. */
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
    workspace: { inherited: rootOptions.features },
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
