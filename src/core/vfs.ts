import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

interface PendingFile {
  content: string
  executable: boolean
}

/**
 * Reads fall through to disk; writes stay in memory until `commit`, so a
 * whole generation can be previewed or discarded before touching the disk.
 */
export class VirtualFs {
  readonly root: string
  private readonly pending = new Map<string, PendingFile>()

  constructor(root: string) {
    this.root = root
  }

  async read(path: string): Promise<string | undefined> {
    const file = this.pending.get(path)
    if (file) return file.content
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
    this.pending.set(path, {
      content,
      executable:
        options.executable ?? this.pending.get(path)?.executable ?? false,
    })
  }

  isPending(path: string) {
    return this.pending.has(path)
  }

  changedPaths(): string[] {
    return [...this.pending.keys()].sort()
  }

  async commit() {
    for (const [path, file] of this.pending) {
      const target = join(this.root, path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, file.content)
      if (file.executable) await chmod(target, 0o755)
    }
  }
}

function isNotFound(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
