import type { Context } from './context.ts'
import type { FeatureId, Framework, ProjectKind } from './types.ts'

export interface Feature {
  id: FeatureId
  label: string
  hint?: string
  kinds: ProjectKind[]
  /** Frameworks this feature supports; omitted means framework-agnostic. */
  frameworks?: Framework[]
  /** Features that must be present; they are added automatically. */
  requires?: FeatureId[]
  /** Features that, when present, must be applied before this one. */
  after?: FeatureId[]
  apply(ctx: Context): void | Promise<void>
  /**
   * Refreshes files derived from the project's current state (e.g. scripts).
   * Runs for every present feature after all features have been applied, so
   * features added later are reflected in files written earlier.
   */
  sync?(ctx: Context): void | Promise<void>
}

export function defineFeature(feature: Feature) {
  return feature
}
