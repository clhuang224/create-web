import { createHash } from 'node:crypto'
import pkg from '../../package.json' with { type: 'json' }
import type { ProjectOptions } from './types.ts'
import type { VirtualFs } from './vfs.ts'

export const MANIFEST_PATH = '.create-web.json'

export interface Manifest extends Omit<ProjectOptions, 'name'> {
  /** create-web version that last wrote this manifest. */
  version: string
  /** Hashes of files create-web owns, as last written by create-web. */
  generated?: Record<string, string>
}

export function hashContent(content: string) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

export async function readManifest(
  fs: VirtualFs,
): Promise<Manifest | undefined> {
  const raw = await fs.read(MANIFEST_PATH)
  return raw === undefined ? undefined : (JSON.parse(raw) as Manifest)
}

export function writeManifest(
  fs: VirtualFs,
  options: ProjectOptions,
  generated: Record<string, string>,
) {
  const manifest: Manifest = {
    version: pkg.version,
    kind: options.kind,
    ...(options.framework ? { framework: options.framework } : {}),
    packageManager: options.packageManager,
    features: options.features,
    ...(options.pagesDomain ? { pagesDomain: options.pagesDomain } : {}),
    ...(Object.keys(generated).length > 0
      ? { generated: sortKeys(generated) }
      : {}),
  }
  fs.write(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
}

function sortKeys(record: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  )
}
