import type { VirtualFs } from './vfs.ts'

export interface PackageJson {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

export class PackageJsonEditor {
  readonly data: PackageJson

  constructor(data: PackageJson) {
    this.data = data
  }

  static async load(fs: VirtualFs) {
    const raw = await fs.read('package.json')
    return new PackageJsonEditor(raw ? (JSON.parse(raw) as PackageJson) : {})
  }

  set(key: string, value: unknown) {
    this.data[key] = value
  }

  hasScript(name: string) {
    return this.data.scripts?.[name] !== undefined
  }

  addScripts(scripts: Record<string, string>) {
    this.data.scripts = { ...this.data.scripts, ...scripts }
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
