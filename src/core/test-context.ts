import type { Context, Mode } from './context.ts'
import { PackageJsonEditor } from './package-json.ts'
import { VirtualFs } from './vfs.ts'

/** A minimal in-memory context for unit tests of editors and templates. */
export function createTestContext(mode: Mode = 'create') {
  const notes: string[] = []
  const fs = new VirtualFs('/nonexistent')
  const ctx: Context = {
    mode,
    options: {
      name: 'demo',
      kind: 'frontend',
      framework: 'vue',
      packageManager: 'pnpm',
      features: [],
    },
    fs,
    pkg: new PackageJsonEditor({}),
    workspaceMember: false,
    has: () => false,
    run: (script) => `pnpm run ${script}`,
    note: (message) => notes.push(message),
    writeGenerated: (path, content) => fs.write(path, content),
    canRegenerate: async () => true,
  }
  return { ctx, fs, notes }
}
