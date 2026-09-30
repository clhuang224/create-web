import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { templatesDir } from '../paths.ts'
import type { Context } from './context.ts'

const NAME_TOKEN = /__PROJECT_NAME__/g

/** Files a monorepo root owns; workspace members do not get their own copy. */
const WORKSPACE_ROOT_FILES = new Set(['.gitignore', '.editorconfig'])

/**
 * Copies `templates/<name>` into the virtual fs. A single leading `_` in a file
 * name becomes `.`, because npm drops files such as `.gitignore` when publishing;
 * names like `__tests__` are kept as is.
 */
export async function copyTemplate(ctx: Context, name: string) {
  const root = join(templatesDir, name)
  for (const file of await listFiles(root)) {
    const source = relative(root, file).split(sep).join('/')
    const target = toTargetPath(source)
    if (ctx.workspaceMember && WORKSPACE_ROOT_FILES.has(target)) continue
    await ctx.addFile(target, await renderTemplateFile(ctx, name, source))
  }
}

/** Undoes `copyTemplate`: deletes each file the template added, if unchanged. */
export async function removeTemplate(ctx: Context, name: string) {
  const root = join(templatesDir, name)
  for (const file of await listFiles(root)) {
    const source = relative(root, file).split(sep).join('/')
    await ctx.removeFile(
      toTargetPath(source),
      await renderTemplateFile(ctx, name, source),
    )
  }
}

export async function renderTemplateFile(
  ctx: Context,
  name: string,
  source: string,
) {
  const content = await readFile(join(templatesDir, name, source), 'utf8')
  return content.replace(NAME_TOKEN, ctx.options.name)
}

function toTargetPath(source: string) {
  return source
    .split('/')
    .map((part) => (/^_[^_]/.test(part) ? `.${part.slice(1)}` : part))
    .join('/')
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? listFiles(path) : [path]
    }),
  )
  return nested.flat()
}
