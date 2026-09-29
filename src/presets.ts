import type { FeatureId, Framework, PackageManager } from './core/types.ts'
import { features } from './features/index.ts'

export interface Preset {
  framework: Framework
  packageManager: PackageManager
  /** Omitted: every feature that supports the chosen framework, minus `exclude`. */
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
  framework: Framework,
): FeatureId[] {
  return (
    preset.features ??
    compatibleFeatures(framework)
      .map((feature) => feature.id)
      .filter((id) => !preset.exclude?.includes(id))
  )
}

export function compatibleFeatures(framework: Framework) {
  return features.filter(
    (feature) => !feature.frameworks || feature.frameworks.includes(framework),
  )
}
