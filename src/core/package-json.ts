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

export type DependencySection = 'dependencies' | 'devDependencies'

/** Dependencies create-web added to package.json, per section. */
export type OwnedDependencies = Partial<Record<DependencySection, string[]>>

const SECTIONS: DependencySection[] = ['dependencies', 'devDependencies']

export class PackageJsonEditor {
  readonly data: PackageJson
  /** Scripts the project had before this run; `addScripts` never replaces them. */
  private readonly initialScripts: Record<string, string>
  private readonly note?: NoteHandler
  /**
   * Names create-web added, per section. Undefined for projects whose manifest
   * predates ownership tracking: then removals fall back to `devDependencies`.
   */
  private readonly owned?: Record<DependencySection, Set<string>>
  /** Names added in this run; recorded as owned in the manifest. */
  private readonly addedThisRun: Record<DependencySection, Set<string>> = {
    dependencies: new Set(),
    devDependencies: new Set(),
  }
  /** Entries removed in this run, restored as they were if a feature adds them back. */
  private readonly removed = new Map<
    string,
    { section: DependencySection; version: string; owned: boolean }
  >()

  constructor(
    data: PackageJson,
    note?: NoteHandler,
    owned?: OwnedDependencies,
  ) {
    this.data = data
    this.initialScripts = { ...data.scripts }
    this.note = note
    if (owned) {
      this.owned = {
        dependencies: new Set(owned.dependencies),
        devDependencies: new Set(owned.devDependencies),
      }
    }
  }

  static async load(
    fs: VirtualFs,
    note?: NoteHandler,
    owned?: OwnedDependencies,
  ) {
    const raw = await fs.read('package.json')
    return new PackageJsonEditor(
      raw ? (JSON.parse(raw) as PackageJson) : {},
      note,
      owned,
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
   * value changed since is kept and reported. Returns the names of the kept
   * scripts, so callers can keep the tools those scripts run.
   */
  removeScripts(scripts: Record<string, string>): string[] {
    const kept: string[] = []
    for (const [name, value] of Object.entries(scripts)) {
      const current = this.data.scripts?.[name]
      if (current === undefined) continue
      if (current !== value) {
        this.note?.(
          `The "${name}" script was changed ("${current}"), so it was kept.`,
        )
        kept.push(name)
        continue
      }
      this.deleteScript(name)
    }
    return kept
  }

  /** Deletes a script unconditionally; for callers that checked the current value themselves. */
  deleteScript(name: string) {
    if (!this.data.scripts) return
    this.data.scripts = Object.fromEntries(
      Object.entries(this.data.scripts).filter(([script]) => script !== name),
    )
  }

  /**
   * Removes dependencies create-web added: only names recorded as owned, and
   * only from the section create-web added them to. Without ownership records
   * (older projects), only `devDependencies` are touched; callers then pass
   * just the names their `apply` adds for this project.
   */
  removeDependencies(names: string[]) {
    for (const name of names) {
      for (const section of SECTIONS) {
        if (!this.removable(section, name)) continue
        const version = this.data[section]?.[name]
        if (version === undefined) continue
        this.removed.set(name, {
          section,
          version,
          owned: this.owned !== undefined,
        })
        this.data[section] = without(this.data[section], [name])
        this.owned?.[section].delete(name)
        this.addedThisRun[section].delete(name)
      }
    }
  }

  /** Adds runtime dependencies the project does not have yet; existing entries are left as they are. */
  addDependencies(deps: Record<string, string>) {
    this.add('dependencies', deps)
  }

  /** Adds dev dependencies the project does not have yet; existing entries are left as they are. */
  addDevDependencies(deps: Record<string, string>) {
    this.add('devDependencies', deps)
  }

  /**
   * Dependencies create-web owns after this run, for the manifest. Undefined
   * when ownership was never recorded and this run added nothing, so older
   * projects keep the fallback.
   */
  ownedDependencies(): OwnedDependencies | undefined {
    if (
      !this.owned &&
      SECTIONS.every((section) => this.addedThisRun[section].size === 0)
    ) {
      return undefined
    }
    const owned: OwnedDependencies = {}
    for (const section of SECTIONS) {
      const names = new Set([
        ...(this.owned?.[section] ?? []),
        ...this.addedThisRun[section],
      ])
      // Drop names the user removed from package.json since.
      const present = [...names].filter(
        (name) => this.data[section]?.[name] !== undefined,
      )
      if (present.length > 0) owned[section] = present.sort()
    }
    return owned
  }

  save(fs: VirtualFs) {
    fs.write('package.json', `${JSON.stringify(this.data, null, 2)}\n`)
  }

  private removable(section: DependencySection, name: string) {
    if (this.addedThisRun[section].has(name)) return true
    if (this.owned) return this.owned[section].has(name)
    return section === 'devDependencies'
  }

  private add(section: DependencySection, deps: Record<string, string>) {
    for (const [name, version] of Object.entries(deps)) {
      if (this.has(name)) continue
      // Removed earlier in this run but still needed by a remaining feature:
      // put the original entry back where it was.
      const restored = this.removed.get(name)
      if (restored) {
        this.removed.delete(name)
        this.setDependency(restored.section, name, restored.version)
        if (restored.owned) this.owned?.[restored.section].add(name)
        continue
      }
      this.setDependency(section, name, version)
      this.addedThisRun[section].add(name)
    }
  }

  private setDependency(
    section: DependencySection,
    name: string,
    version: string,
  ) {
    this.data[section] = sortKeys({ ...this.data[section], [name]: version })
  }

  private has(name: string) {
    return SECTIONS.some((section) => this.data[section]?.[name] !== undefined)
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
