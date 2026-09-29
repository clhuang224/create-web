import { selectBase } from '../bases/index.ts'
import { features as registry } from '../features/index.ts'
import type { Context, Mode } from './context.ts'
import { formatChangedFiles } from './format.ts'
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
}

export interface GenerateResult {
  fs: VirtualFs
  applied: FeatureId[]
  notes: string[]
}

export async function generate({
  root,
  mode,
  options,
  existing = [],
  workspace,
  members,
}: GenerateInput): Promise<GenerateResult> {
  const applyBase = selectBase(options)
  if (workspace) assertMemberFeatures(options.features)

  const resolved = resolveFeatures(registry, {
    kind: options.kind,
    framework: options.framework,
    features: [...existing, ...options.features],
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
    pkg: await PackageJsonEditor.load(fs),
    workspaceMember: workspace !== undefined,
    has: (feature) => present.has(feature) || inherited.has(feature),
    run: (script) => `${options.packageManager} run ${script}`,
    note: (message) => notes.push(message),
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
  for (const feature of resolved) await feature.sync?.(ctx)

  ctx.pkg.save(fs)
  await formatChangedFiles(fs)

  // Hash after formatting, since that is what lands on disk.
  const hashes: Record<string, string> = {}
  for (const path of generatedPaths) {
    const content = await fs.read(path)
    if (content !== undefined) hashes[path] = hashContent(content)
  }
  writeManifest(fs, finalOptions, {
    generated: hashes,
    members: members ?? previous?.members,
    workspace,
  })
  await formatChangedFiles(fs)

  return { fs, applied: toApply.map((feature) => feature.id), notes }
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
