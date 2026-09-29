import type { FeatureId, Framework, PackageManager } from './core/types.ts'
import { features } from './features/index.ts'

export interface Preset {
  framework: Framework
  packageManager: PackageManager
  features: FeatureId[]
}

export const presets = {
  /** The author's usual setup. */
  lynn: {
    framework: 'vue',
    packageManager: 'pnpm',
    features: features.map((feature) => feature.id),
  },
} satisfies Record<string, Preset>

export type PresetName = keyof typeof presets
