import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

type PendingFile =
  { deleted: false; content: string; executable: boolean } | { deleted: true }

/**
 * Reads fall through to disk; writes and deletions stay in memory until
 * `commit`, so a whole generation can be previewed or discarded before
 * touching the disk.
 */
export class VirtualFs {
  readonly root: string
  private readonly pending = new Map<string, PendingFile>()

  constructor(root: string) {
    this.root = root
  }

  async read(path: string): Promise<string | undefined> {
    const file = this.pending.get(path)
    if (file) return file.deleted ? undefined : file.content
    try {
      return await readFile(join(this.root, path), 'utf8')
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await this.read(path)) !== undefined
  }

  write(path: string, content: string, options: { executable?: boolean } = {}) {
    const previous = this.pending.get(path)
    this.pending.set(path, {
      deleted: false,
      content,
      executable:
        options.executable ??
        (previous && !previous.deleted ? previous.executable : false),
    })
  }

  delete(path: string) {
    this.pending.set(path, { deleted: true })
  }

  isPending(path: string) {
    return this.pending.has(path)
  }

  /** Paths written or deleted in this run. */
  changedPaths(): string[] {
    return [...this.pending.keys()].sort()
  }

  deletedPaths(): string[] {
    return [...this.pending]
      .filter(([, file]) => file.deleted)
      .map(([path]) => path)
      .sort()
  }

  /** Drops pending writes that would leave a file exactly as it is on disk. */
  async dropUnchanged() {
    for (const [path, file] of this.pending) {
      if (file.deleted || file.executable) continue
      try {
        const current = await readFile(join(this.root, path), 'utf8')
        if (current === file.content) this.pending.delete(path)
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    }
  }

  async commit() {
    for (const [path, file] of this.pending) {
      const target = join(this.root, path)
      if (file.deleted) {
        await rm(target, { force: true })
        continue
      }
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, file.content)
      if (file.executable) await chmod(target, 0o755)
    }
  }
}

function isNotFound(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
