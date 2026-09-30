import type { VirtualFs } from './vfs.ts'

export interface PackageJson {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

export type ScriptConflictHandler = (
  script: string,
  current: string,
  next: string,
) => void

export class PackageJsonEditor {
  readonly data: PackageJson
  /** Scripts the project had before this run; `addScripts` never replaces them. */
  private readonly initialScripts: Record<string, string>
  private readonly onScriptConflict?: ScriptConflictHandler

  constructor(data: PackageJson, onScriptConflict?: ScriptConflictHandler) {
    this.data = data
    this.initialScripts = { ...data.scripts }
    this.onScriptConflict = onScriptConflict
  }

  static async load(fs: VirtualFs, onScriptConflict?: ScriptConflictHandler) {
    const raw = await fs.read('package.json')
    return new PackageJsonEditor(
      raw ? (JSON.parse(raw) as PackageJson) : {},
      onScriptConflict,
    )
  }

  set(key: string, value: unknown) {
    this.data[key] = value
  }

  hasScript(name: string) {
    return this.data.scripts?.[name] !== undefined
  }

  /** Adds scripts; a script the project already had is kept and reported. */
  addScripts(scripts: Record<string, string>) {
    for (const [name, value] of Object.entries(scripts)) {
      const initial = this.initialScripts[name]
      if (initial !== undefined && initial !== value) {
        this.onScriptConflict?.(name, initial, value)
        continue
      }
      this.setScript(name, value)
    }
  }

  /** Sets a script unconditionally; for callers that checked the current value themselves. */
  setScript(name: string, value: string) {
    this.data.scripts = { ...this.data.scripts, [name]: value }
  }

  addDependencies(deps: Record<string, string>) {
    this.data.dependencies = sortKeys({ ...this.data.dependencies, ...deps })
  }

  addDevDependencies(deps: Record<string, string>) {
    this.data.devDependencies = sortKeys({
      ...this.data.devDependencies,
      ...deps,
    })
  }

  save(fs: VirtualFs) {
    fs.write('package.json', `${JSON.stringify(this.data, null, 2)}\n`)
  }
}

function sortKeys(record: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  )
}
