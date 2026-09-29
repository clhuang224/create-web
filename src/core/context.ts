import type { PackageJsonEditor } from './package-json.ts'
import type { FeatureId, ProjectOptions } from './types.ts'
import type { VirtualFs } from './vfs.ts'

export type Mode = 'create' | 'add'

export interface Context {
  mode: Mode
  options: ProjectOptions
  fs: VirtualFs
  pkg: PackageJsonEditor
  /** True for projects inside a monorepo; the root owns shared files like .gitignore. */
  workspaceMember: boolean
  /** Features present in the project after this run, including ones applied earlier. */
  has(feature: FeatureId): boolean
  /** Command that runs a package.json script with the chosen package manager. */
  run(script: string): string
  /** Record a manual step the user still has to do. */
  note(message: string): void
  /**
   * Writes a file that create-web owns and may regenerate later. Its hash is
   * recorded in the manifest so later runs can tell whether the user edited it.
   */
  writeGenerated(path: string, content: string): void
  /** True if the file is missing, written in this run, or unchanged since create-web last wrote it. */
  canRegenerate(path: string): Promise<boolean>
}
