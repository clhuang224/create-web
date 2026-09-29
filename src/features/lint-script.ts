import type { Context } from '../core/context.ts'

const KNOWN_LINT_SCRIPTS = ['eslint .', 'oxlint', 'oxlint && eslint .']

/**
 * Composes the `lint` script from the linters present. oxlint runs first because
 * it is fast and ESLint skips the rules oxlint already covers.
 */
export function syncLintScript(ctx: Context) {
  const next = [ctx.has('oxlint') && 'oxlint', ctx.has('eslint') && 'eslint .']
    .filter((command) => command !== false)
    .join(' && ')
  const current = ctx.pkg.data.scripts?.lint
  if (current === next) return
  if (current === undefined || KNOWN_LINT_SCRIPTS.includes(current)) {
    ctx.pkg.addScripts({ lint: next })
  } else {
    ctx.note(`Update the "lint" script to run: ${next}`)
  }
}
