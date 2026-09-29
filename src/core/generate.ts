import { applyVueBase } from '../bases/vue.ts'
import { features as registry } from '../features/index.ts'
import type { Context, Mode } from './context.ts'
import { formatChangedFiles } from './format.ts'
import { writeManifest } from './manifest.ts'
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
  if (options.framework !== 'vue')
    throw new ResolveError(`${options.framework} is not supported yet`)

  const resolved = resolveFeatures(registry, {
    kind: options.kind,
    framework: options.framework,
    features: [...existing, ...options.features],
  })
  const present = new Set(resolved.map((feature) => feature.id))
  const toApply = resolved.filter((feature) => !existing.includes(feature.id))

  const fs = new VirtualFs(root)
  const notes: string[] = []
  const finalOptions: ProjectOptions = { ...options, features: [...present] }
  const ctx: Context = {
    mode,
    options: finalOptions,
    fs,
    pkg: await PackageJsonEditor.load(fs),
    has: (feature) => present.has(feature),
    run: (script) => `${options.packageManager} run ${script}`,
    note: (message) => notes.push(message),
  }

  if (mode === 'create') await applyVueBase(ctx)
  for (const feature of toApply) await feature.apply(ctx)

  ctx.pkg.save(fs)
  writeManifest(fs, finalOptions)
  await formatChangedFiles(fs)

  return { fs, applied: toApply.map((feature) => feature.id), notes }
}
