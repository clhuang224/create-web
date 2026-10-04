import type { Context } from '../core/context.ts'

/** Things `remove` kept because the user edited them. */
export interface Kept {
  files?: string[]
  scripts?: string[]
}

/**
 * Removes a feature's dependencies, unless a file or script of the feature was
 * kept because the user edited it: that file or script may still need them.
 */
export function removeFeatureDependencies(
  ctx: Context,
  names: string[],
  { files = [], scripts = [] }: Kept = {},
) {
  const reasons = [
    ...scripts.map((script) => `the "${script}" script`),
    ...files,
  ]
  if (reasons.length === 0) {
    ctx.pkg.removeDependencies(names)
    return
  }
  const installed = names.filter(
    (name) =>
      ctx.pkg.data.dependencies?.[name] !== undefined ||
      ctx.pkg.data.devDependencies?.[name] !== undefined,
  )
  if (installed.length === 0) return
  ctx.note(
    `Kept ${installed.join(', ')} because ${joinList(reasons)} ${reasons.length === 1 ? 'was' : 'were'} kept and may still use ${installed.length === 1 ? 'it' : 'them'}; uninstall ${installed.length === 1 ? 'it' : 'them'} once nothing does.`,
  )
}

function joinList(items: string[]) {
  return items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
