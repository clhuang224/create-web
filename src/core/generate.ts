import { bases } from '../bases/index.ts'
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
}: GenerateInput): Promise<GenerateResult> {
  if (options.kind !== 'frontend')
    throw new ResolveError(`${options.kind} projects are not supported yet`)
  if (!Object.hasOwn(bases, options.framework))
    throw new ResolveError(`Unknown framework: ${options.framework}`)

  const resolved = resolveFeatures(registry, {
    kind: options.kind,
    framework: options.framework,
    features: [...existing, ...options.features],
  })
  const present = new Set(resolved.map((feature) => feature.id))
  const toApply = resolved.filter((feature) => !existing.includes(feature.id))

  const fs = new VirtualFs(root)
  const notes: string[] = []
  const previousHashes = (await readManifest(fs))?.generated ?? {}
  const generatedPaths = new Set<string>(Object.keys(previousHashes))
  const finalOptions: ProjectOptions = { ...options, features: [...present] }
  const ctx: Context = {
    mode,
    options: finalOptions,
    fs,
    pkg: await PackageJsonEditor.load(fs),
    has: (feature) => present.has(feature),
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

  if (mode === 'create') await bases[options.framework](ctx)
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
  writeManifest(fs, finalOptions, hashes)
  await formatChangedFiles(fs)

  return { fs, applied: toApply.map((feature) => feature.id), notes }
}
