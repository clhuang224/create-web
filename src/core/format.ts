import { format, getFileInfo } from 'prettier'
import { prettierOptions } from '../features/prettier.ts'
import type { VirtualFs } from './vfs.ts'

export async function formatSource(path: string, content: string) {
  if (path.endsWith('.md')) return content
  const { inferredParser } = await getFileInfo(path)
  if (!inferredParser) return content
  return format(content, { ...prettierOptions, filepath: path })
}

/** Formats generated files so projects pass `format:check` right after creation. */
export async function formatChangedFiles(fs: VirtualFs) {
  for (const path of fs.changedPaths()) {
    const content = await fs.read(path)
    if (content === undefined) continue
    const formatted = await formatSource(path, content)
    if (formatted !== content) fs.write(path, formatted)
  }
}
