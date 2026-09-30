import type { VirtualFs } from './vfs.ts'

export interface PackageJson {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

/** Receives messages about scripts create-web left alone. */
export type NoteHandler = (message: string) => void

export class PackageJsonEditor {
  readonly data: PackageJson
  /** Scripts the project had before this run; `addScripts` never replaces them. */
  private readonly initialScripts: Record<string, string>
  private readonly note?: NoteHandler

  constructor(data: PackageJson, note?: NoteHandler) {
    this.data = data
    this.initialScripts = { ...data.scripts }
    this.note = note
  }

  static async load(fs: VirtualFs, note?: NoteHandler) {
    const raw = await fs.read('package.json')
    return new PackageJsonEditor(
      raw ? (JSON.parse(raw) as PackageJson) : {},
      note,
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
        this.note?.(
          `The "${name}" script already exists ("${initial}") and was kept; create-web would set it to "${value}".`,
        )
        continue
      }
      this.setScript(name, value)
    }
  }

  /** Sets a script unconditionally; for callers that checked the current value themselves. */
  setScript(name: string, value: string) {
    this.data.scripts = { ...this.data.scripts, [name]: value }
  }

  /**
   * Removes scripts create-web added, given the values it set. A script whose
   * value changed since is kept and reported.
   */
  removeScripts(scripts: Record<string, string>) {
    for (const [name, value] of Object.entries(scripts)) {
      const current = this.data.scripts?.[name]
      if (current === undefined) continue
      if (current !== value) {
        this.note?.(
          `The "${name}" script was changed ("${current}"), so it was kept.`,
        )
        continue
      }
      this.deleteScript(name)
    }
  }

  /** Deletes a script unconditionally; for callers that checked the current value themselves. */
  deleteScript(name: string) {
    if (!this.data.scripts) return
    this.data.scripts = Object.fromEntries(
      Object.entries(this.data.scripts).filter(([script]) => script !== name),
    )
  }

  removeDependencies(names: string[]) {
    this.data.dependencies = without(this.data.dependencies, names)
    this.data.devDependencies = without(this.data.devDependencies, names)
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

function without(record: Record<string, string> | undefined, names: string[]) {
  if (!record) return record
  return Object.fromEntries(
    Object.entries(record).filter(([name]) => !names.includes(name)),
  )
}

function sortKeys(record: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  )
}
