import type { Context } from '../core/context.ts'

export type CommentStyle = 'hash' | 'html'

const comment = (style: CommentStyle, text: string) =>
  style === 'hash' ? `# ${text}` : `<!-- ${text} -->`
const startMarker = (id: string) => `create-web:start ${id}`
const endMarker = (id: string) => `create-web:end ${id}`

/**
 * A block of lines that create-web owns and rewrites on every run. Everything
 * outside the markers belongs to the user and is never touched.
 */
export function managedBlock(id: string, style: CommentStyle, indent = '') {
  return [comment(style, startMarker(id)), comment(style, endMarker(id))]
    .map((line) => `${indent}${line}`)
    .join('\n')
}

/** Empties every managed block, so files can be compared regardless of what sync wrote. */
export function stripManagedBlocks(content: string) {
  const kept: string[] = []
  let inBlock = false
  for (const line of content.split('\n')) {
    if (line.includes('create-web:end ')) inBlock = false
    if (!inBlock) kept.push(line)
    if (line.includes('create-web:start ')) inBlock = true
  }
  return kept.join('\n')
}

export async function syncManagedBlock(
  ctx: Context,
  path: string,
  block: { id: string; style: CommentStyle; lines: string[] },
) {
  const source = await ctx.fs.read(path)
  if (source === undefined) return

  const lines = source.split('\n')
  const start = lines.findIndex(
    (line) => line.trim() === comment(block.style, startMarker(block.id)),
  )
  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      line.trim() === comment(block.style, endMarker(block.id)),
  )
  if (start === -1 || end === -1) {
    ctx.note(
      `Could not find the "${block.id}" block in ${path}; update it manually.`,
    )
    return
  }

  const indent = /^\s*/.exec(lines[start] ?? '')?.[0] ?? ''
  const next = [
    ...lines.slice(0, start + 1),
    ...block.lines.map((line) => (line ? `${indent}${line}` : line)),
    ...lines.slice(end),
  ].join('\n')
  if (next !== source) ctx.fs.write(path, next)
}
