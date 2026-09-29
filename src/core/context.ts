import type { PackageJsonEditor } from './package-json.ts'
import type { FeatureId, ProjectOptions } from './types.ts'
import type { VirtualFs } from './vfs.ts'

export type Mode = 'create' | 'add'

export interface Context {
  mode: Mode
  options: ProjectOptions
  fs: VirtualFs
  pkg: PackageJsonEditor
  /** Features present in the project after this run, including ones applied earlier. */
  has(feature: FeatureId): boolean
  /** Command that runs a package.json script with the chosen package manager. */
  run(script: string): string
  /** Record a manual step the user still has to do. */
  note(message: string): void
}
