import type { FeatureId, Framework, PackageManager } from './core/types.ts'
import { features } from './features/index.ts'

export interface Preset {
  framework: Framework
  packageManager: PackageManager
  /** Omitted: every feature that supports the chosen framework. */
  features?: FeatureId[]
}

export const presets = {
  /** The author's usual setup. */
  lynn: {
    framework: 'vue',
    packageManager: 'pnpm',
  },
} satisfies Record<string, Preset>

export type PresetName = keyof typeof presets

export function presetFeatures(
  preset: Preset,
  framework: Framework,
): FeatureId[] {
  return (
    preset.features ??
    features
      .filter(
        (feature) =>
          !feature.frameworks || feature.frameworks.includes(framework),
      )
      .map((feature) => feature.id)
  )
}
