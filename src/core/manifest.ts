import pkg from '../../package.json' with { type: 'json' }
import type { ProjectOptions } from './types.ts'
import type { VirtualFs } from './vfs.ts'

export const MANIFEST_PATH = '.create-web.json'

export interface Manifest extends Omit<ProjectOptions, 'name'> {
  /** create-web version that last wrote this manifest. */
  version: string
}

export async function readManifest(
  fs: VirtualFs,
): Promise<Manifest | undefined> {
  const raw = await fs.read(MANIFEST_PATH)
  return raw === undefined ? undefined : (JSON.parse(raw) as Manifest)
}

export function writeManifest(fs: VirtualFs, options: ProjectOptions) {
  const manifest: Manifest = {
    version: pkg.version,
    kind: options.kind,
    framework: options.framework,
    packageManager: options.packageManager,
    features: options.features,
    ...(options.pagesDomain ? { pagesDomain: options.pagesDomain } : {}),
  }
  fs.write(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
}
