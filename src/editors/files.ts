import type { Context } from '../core/context.ts'

export async function updateJson<T>(
  ctx: Context,
  path: string,
  update: (data: T) => void,
) {
  const source = await ctx.fs.read(path)
  if (source === undefined) return false
  let data: T
  try {
    data = JSON.parse(source) as T
  } catch {
    // tsconfig files may contain comments, which JSON.parse rejects.
    return false
  }
  update(data)
  ctx.fs.write(path, `${JSON.stringify(data, null, 2)}\n`)
  return true
}

/**
 * Replaces a file only if it still matches what the base template generated,
 * so user edits are never overwritten.
 */
export async function replaceIfUnchanged(
  ctx: Context,
  path: string,
  expected: string,
  next: string,
  manual: string,
) {
  const current = await ctx.fs.read(path)
  if (current === undefined || normalize(current) === normalize(expected)) {
    ctx.fs.write(path, next)
  } else {
    ctx.note(manual)
  }
}

export async function prependToFile(
  ctx: Context,
  path: string,
  text: string,
  manual: string,
) {
  const current = await ctx.fs.read(path)
  if (current === undefined) {
    ctx.note(manual)
    return
  }
  if (current.includes(text.trim())) return
  ctx.fs.write(path, `${text}${current}`)
}

function normalize(content: string) {
  return content.replace(/\s+/g, ' ').trim()
}
