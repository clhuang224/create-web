import type { Feature } from './feature.ts'
import type { FeatureId, Framework, ProjectKind } from './types.ts'

export class ResolveError extends Error {}

export interface ResolveInput {
  kind: ProjectKind
  framework?: Framework
  features: FeatureId[]
}

/**
 * Expands `requires`, validates kind/framework support, and orders features so
 * that `requires` and `after` dependencies are applied first.
 */
export function resolveFeatures(
  registry: readonly Feature[],
  input: ResolveInput,
): Feature[] {
  const byId = new Map(registry.map((feature) => [feature.id, feature]))
  const selected = new Set<FeatureId>()

  const select = (id: FeatureId) => {
    if (selected.has(id)) return
    const feature = byId.get(id)
    if (!feature) throw new ResolveError(`Unknown feature: ${id}`)
    if (!feature.kinds.includes(input.kind)) {
      throw new ResolveError(
        `Feature "${id}" does not support ${input.kind} projects`,
      )
    }
    if (
      feature.frameworks &&
      input.framework &&
      !feature.frameworks.includes(input.framework)
    ) {
      throw new ResolveError(
        `Feature "${id}" does not support ${input.framework}`,
      )
    }
    selected.add(id)
    feature.requires?.forEach(select)
  }
  input.features.forEach(select)

  for (const id of selected) {
    const conflict = byId
      .get(id)
      ?.conflicts?.find((other) => selected.has(other))
    if (conflict)
      throw new ResolveError(
        `Features "${id}" and "${conflict}" cannot be used together`,
      )
  }

  const ordered: Feature[] = []
  const visiting = new Set<FeatureId>()
  const visited = new Set<FeatureId>()

  const visit = (id: FeatureId) => {
    if (visited.has(id)) return
    if (visiting.has(id))
      throw new ResolveError(`Circular feature dependency at "${id}"`)
    visiting.add(id)
    const feature = byId.get(id)
    if (!feature) throw new ResolveError(`Unknown feature: ${id}`)
    for (const dep of [...(feature.requires ?? []), ...(feature.after ?? [])]) {
      if (selected.has(dep)) visit(dep)
    }
    visiting.delete(id)
    visited.add(id)
    ordered.push(feature)
  }
  // Registry order keeps the output stable regardless of how the user listed features.
  registry
    .filter((feature) => selected.has(feature.id))
    .forEach((feature) => visit(feature.id))

  return ordered
}
