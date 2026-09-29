import { format, getFileInfo } from 'prettier'
import { prettierOptions } from '../features/prettier.ts'
import type { VirtualFs } from './vfs.ts'

/** Formats generated files so projects pass `format:check` right after creation. */
export async function formatChangedFiles(fs: VirtualFs) {
  for (const path of fs.changedPaths()) {
    if (path.endsWith('.md')) continue
    const { inferredParser } = await getFileInfo(path)
    if (!inferredParser) continue
    const content = await fs.read(path)
    if (content === undefined) continue
    fs.write(
      path,
      await format(content, { ...prettierOptions, filepath: path }),
    )
  }
}
