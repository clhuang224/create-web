import type {
  FeatureId,
  Framework,
  PackageManager,
  ProjectKind,
} from './core/types.ts'
import { features } from './features/index.ts'

export interface Preset {
  /** Framework used for frontend projects when none is given. */
  framework: Framework
  packageManager: PackageManager
  /** Omitted: every feature that supports the project, minus `exclude`. */
  features?: FeatureId[]
  exclude?: FeatureId[]
}

export const presets = {
  /** The author's usual setup. */
  lynn: {
    framework: 'vue',
    packageManager: 'pnpm',
    // ESLint + Prettier, as in most of the author's projects.
    exclude: ['oxlint', 'oxfmt'],
  },
} satisfies Record<string, Preset>

export type PresetName = keyof typeof presets

export function presetFeatures(
  preset: Preset,
  kind: ProjectKind,
  framework?: Framework,
): FeatureId[] {
  return (
    preset.features ??
    compatibleFeatures(kind, framework)
      .map((feature) => feature.id)
      .filter((id) => !preset.exclude?.includes(id))
  )
}

export function compatibleFeatures(kind: ProjectKind, framework?: Framework) {
  return features.filter(
    (feature) =>
      feature.kinds.includes(kind) &&
      (!feature.frameworks ||
        !framework ||
        feature.frameworks.includes(framework)),
  )
}
