import { join, relative, resolve, sep } from 'node:path'
import * as p from '@clack/prompts'
import { getFileInfo } from 'prettier'
import { formatSource } from '../core/format.ts'
import {
  hashContent,
  MANIFEST_PATH,
  type Manifest,
  readManifest,
} from '../core/manifest.ts'
import type { PackageManager } from '../core/types.ts'
import { VirtualFs } from '../core/vfs.ts'
import { runProcess } from './shared.ts'

export type Formatter = 'prettier' | 'oxfmt'

/** A project touched by this run, relative to the directory the formatter runs in. */
export interface TouchedProject {
  dir: string
  fs: VirtualFs
}

export function formatterOf(manifest: Manifest): Formatter | undefined {
  const features = [
    ...manifest.features,
    ...(manifest.workspace?.inherited ?? []),
  ]
  if (features.includes('oxfmt')) return 'oxfmt'
  if (features.includes('prettier')) return 'prettier'
  return undefined
}

/** Files this run wrote that a formatter understands, relative to `root`. */
export async function formattableFiles(projects: TouchedProject[]) {
  const files: string[] = []
  for (const { dir, fs } of projects) {
    const deleted = new Set(fs.deletedPaths())
    for (const path of fs.changedPaths()) {
      if (deleted.has(path) || path.endsWith('.md')) continue
      if (!(await getFileInfo(path)).inferredParser) continue
      files.push(dir ? `${dir}/${path}` : path)
    }
  }
  return files
}

function formatterCommand(
  packageManager: PackageManager,
  formatter: Formatter,
  files: string[],
): [string, string[]] {
  const exec = packageManager === 'bun' ? ['x'] : ['exec']
  const args =
    formatter === 'oxfmt'
      ? ['oxfmt', '--no-error-on-unmatched-pattern', ...files]
      : ['prettier', '--write', '--ignore-unknown', ...files]
  return [packageManager, [...exec, ...args]]
}

/**
 * Re-hashes generated files this run wrote, after the project's formatter may
 * have changed them. Files this run did not write keep their recorded hash, so
 * user edits are never recorded as "generated". Returns the fs to commit.
 */
export async function refreshGeneratedHashes(root: string, written: string[]) {
  const fs = new VirtualFs(root)
  const manifest = await readManifest(fs)
  if (!manifest?.generated) return fs
  const generated = { ...manifest.generated }
  let changed = false
  for (const path of written) {
    if (!(path in generated)) continue
    const content = await fs.read(path)
    if (content === undefined) continue
    const hash = hashContent(content)
    if (generated[path] !== hash) {
      generated[path] = hash
      changed = true
    }
  }
  if (changed) {
    fs.write(
      MANIFEST_PATH,
      await formatSource(
        MANIFEST_PATH,
        `${JSON.stringify({ ...manifest, generated }, null, 2)}\n`,
      ),
    )
  }
  return fs
}

/**
 * Formats the files create-web wrote with the project's own formatter, so the
 * result matches that formatter even where it differs from the Prettier pass
 * create-web applies itself. Needs installed dependencies; returns false if
 * the formatter could not run.
 */
export async function formatWithProjectFormatter({
  root,
  packageManager,
  formatter,
  projects,
}: {
  root: string
  packageManager: PackageManager
  formatter: Formatter
  projects: TouchedProject[]
}) {
  const files = await formattableFiles(projects)
  if (files.length === 0) return true
  const [command, args] = formatterCommand(packageManager, formatter, files)
  if ((await runProcess(command, args, root, true)) !== 0) return false

  // Record hashes of what the formatter produced, then format the manifests
  // those hashes were written to.
  const manifests: string[] = []
  for (const { dir, fs } of projects) {
    const refreshed = await refreshGeneratedHashes(
      join(root, dir),
      fs.changedPaths(),
    )
    if (refreshed.isPending(MANIFEST_PATH)) {
      await refreshed.commit()
      manifests.push(dir ? `${dir}/${MANIFEST_PATH}` : MANIFEST_PATH)
    }
  }
  if (manifests.length > 0) {
    const [again, againArgs] = formatterCommand(
      packageManager,
      formatter,
      manifests,
    )
    await runProcess(again, againArgs, root, true)
  }
  return true
}

/**
 * Runs the project's formatter over what this run wrote, if the project has
 * one. `root` is where the formatter is installed (the monorepo root for
 * workspace members).
 */
export async function formatTouchedProjects(
  root: string,
  projects: TouchedProject[],
) {
  const manifest = await readManifest(new VirtualFs(root))
  const formatter = manifest && formatterOf(manifest)
  if (!manifest || !formatter) return
  const formatted = await formatWithProjectFormatter({
    root,
    packageManager: manifest.packageManager,
    formatter,
    projects,
  })
  if (!formatted) {
    p.log.warn(
      `Could not run ${formatter}; files keep create-web's built-in formatting. Run the format script to apply ${formatter}.`,
    )
  }
}

/** Inside a monorepo member, tools are installed at the workspace root. */
export async function formatterLocation(
  projectRoot: string,
  manifest: Manifest,
) {
  const standalone = { root: projectRoot, dir: '' }
  if (!manifest.workspace) return standalone
  const workspaceRoot = resolve(projectRoot, '..', '..')
  const rootManifest = await readManifest(new VirtualFs(workspaceRoot))
  if (rootManifest?.kind !== 'monorepo') return standalone
  return {
    root: workspaceRoot,
    dir: relative(workspaceRoot, projectRoot).split(sep).join('/'),
  }
}
