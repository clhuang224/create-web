import { selectBase } from '../bases/index.ts'
import { features as registry } from '../features/index.ts'
import type { Context, Mode } from './context.ts'
import { stripManagedBlocks } from '../editors/managed-block.ts'
import { formatChangedFiles, formatSource } from './format.ts'
import { hashContent, readManifest, writeManifest } from './manifest.ts'
import { PackageJsonEditor } from './package-json.ts'
import { ResolveError, resolveFeatures } from './resolver.ts'
import type { FeatureId, ProjectOptions } from './types.ts'
import { VirtualFs } from './vfs.ts'

export interface GenerateInput {
  root: string
  mode: Mode
  options: ProjectOptions
  /** Features already applied to the project (add mode). */
  existing?: FeatureId[]
  /**
   * Set for projects inside a monorepo: features the workspace root provides
   * (e.g. the formatter). They count for `ctx.has` but are never applied here.
   */
  workspace?: { inherited: FeatureId[] }
  /** Monorepo root: member paths to record in the manifest. */
  members?: string[]
  /** Remove mode: features to remove from `existing`. */
  remove?: FeatureId[]
}

export interface GenerateResult {
  fs: VirtualFs
  applied: FeatureId[]
  removed: FeatureId[]
  notes: string[]
}

export async function generate({
  root,
  mode,
  options,
  existing = [],
  workspace,
  members,
  remove = [],
}: GenerateInput): Promise<GenerateResult> {
  const applyBase = selectBase(options)
  if (workspace) assertMemberFeatures(options.features)
  const toRemove = mode === 'remove' ? removableFeatures(existing, remove) : []

  const resolved = resolveFeatures(registry, {
    kind: options.kind,
    framework: options.framework,
    features:
      mode === 'remove'
        ? existing.filter((id) => !remove.includes(id))
        : [...existing, ...options.features],
  })
  const present = new Set(resolved.map((feature) => feature.id))
  const toApply = resolved.filter((feature) => !existing.includes(feature.id))

  const fs = new VirtualFs(root)
  const notes: string[] = []
  const previous = await readManifest(fs)
  const previousHashes = previous?.generated ?? {}
  const inherited = new Set(workspace?.inherited ?? [])
  const generatedPaths = new Set<string>(Object.keys(previousHashes))
  const finalOptions: ProjectOptions = { ...options, features: [...present] }
  const ctx: Context = {
    mode,
    options: finalOptions,
    fs,
    // A project without a manifest is new to create-web: nothing in its
    // package.json is ours. A manifest without ownership records predates
    // them, and removals fall back to the feature's own devDependencies.
    pkg: await PackageJsonEditor.load(
      fs,
      (message) => notes.push(message),
      previous ? previous.ownedDependencies : {},
    ),
    workspaceMember: workspace !== undefined,
    has: (feature) => present.has(feature) || inherited.has(feature),
    run: (script) => `${options.packageManager} run ${script}`,
    note: (message) => notes.push(message),
    addFile: async (path, content, fileOptions) => {
      // Files written earlier in this run (e.g. by the base) may be replaced.
      if (!fs.isPending(path)) {
        const current = await fs.read(path)
        if (current !== undefined) {
          if (!(await sameContent(path, current, content))) {
            notes.push(
              `${path} already exists and was kept; create-web did not write its own version.`,
            )
          }
          return
        }
      }
      fs.write(path, content, fileOptions)
    },
    removeFile: async (path, expected, removeOptions = {}) => {
      const current = await fs.read(path)
      if (current === undefined) return true
      const strip = (content: string) =>
        removeOptions.ignoreManagedBlocks
          ? stripManagedBlocks(content)
          : content
      const unchanged =
        expected === undefined
          ? await ctx.canRegenerate(path)
          : await sameContent(path, strip(current), strip(expected))
      if (unchanged) {
        fs.delete(path)
        generatedPaths.delete(path)
        return true
      }
      notes.push(
        `${path} was changed, so it was kept; delete it yourself if it is no longer needed.`,
      )
      return false
    },
    writeGenerated: (path, content) => {
      fs.write(path, content)
      generatedPaths.add(path)
    },
    canRegenerate: async (path) => {
      const current = await fs.read(path)
      if (current === undefined || fs.isPending(path)) return true
      return hashContent(current) === previousHashes[path]
    },
  }

  if (mode === 'create') await applyBase(ctx)
  for (const feature of toApply) await feature.apply(ctx)
  // Undo in reverse order, so a feature is removed before the ones it builds on.
  for (const feature of [...toRemove].reverse()) await feature.remove?.(ctx)
  for (const feature of resolved) await feature.sync?.(ctx)

  ctx.pkg.save(fs)
  await formatChangedFiles(fs)

  // Hash after formatting, since that is what lands on disk. Files this run did
  // not write keep their old hash: re-hashing them would record user edits as
  // "generated" and let the next run overwrite them.
  const hashes: Record<string, string> = {}
  for (const path of generatedPaths) {
    const content = await fs.read(path)
    if (content === undefined) continue
    const previousHash = previousHashes[path]
    hashes[path] =
      fs.isPending(path) || previousHash === undefined
        ? hashContent(content)
        : previousHash
  }
  writeManifest(fs, finalOptions, {
    generated: hashes,
    members: members ?? previous?.members,
    workspace,
    ownedDependencies: ctx.pkg.ownedDependencies(),
  })
  await formatChangedFiles(fs)

  return {
    fs,
    applied: toApply.map((feature) => feature.id),
    removed: toRemove.map((feature) => feature.id),
    notes,
  }
}

/** Checks that each feature can be removed, and returns them in registry order. */
function removableFeatures(existing: FeatureId[], remove: FeatureId[]) {
  for (const id of remove) {
    const feature = registry.find((candidate) => candidate.id === id)
    if (!feature) throw new ResolveError(`Unknown feature: ${id}`)
    if (!existing.includes(id)) {
      throw new ResolveError(`"${id}" is not part of this project`)
    }
    if (!feature.remove) {
      throw new ResolveError(
        `"${id}" cannot be removed automatically yet; remove it by hand`,
      )
    }
  }
  for (const feature of registry) {
    if (!existing.includes(feature.id) || remove.includes(feature.id)) continue
    const needed = feature.requires?.find((id) => remove.includes(id))
    if (needed) {
      throw new ResolveError(
        `"${needed}" is required by "${feature.id}"; remove "${feature.id}" as well`,
      )
    }
  }
  return registry.filter((feature) => remove.includes(feature.id))
}

/** Features owned by the workspace root, or not supported inside a workspace yet. */
function assertMemberFeatures(features: FeatureId[]) {
  for (const id of features) {
    const feature = registry.find((candidate) => candidate.id === id)
    if (feature?.kinds.includes('monorepo')) {
      throw new ResolveError(
        `"${id}" is set up at the workspace root, not in individual projects`,
      )
    }
    if (feature?.standaloneOnly) {
      throw new ResolveError(`"${id}" is not supported inside a monorepo yet`)
    }
  }
}

async function sameContent(path: string, current: string, next: string) {
  const normalize = (content: string) => content.replace(/\s+/g, ' ').trim()
  return normalize(current) === normalize(await formatSource(path, next))
}
