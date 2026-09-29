import type { Context } from '../core/context.ts'
import { versions } from '../versions.ts'

/**
 * Tooling fields for a standalone project. Workspace members inherit them
 * from the monorepo root instead.
 */
export function applyStandaloneFields(ctx: Context) {
  if (ctx.workspaceMember) return
  const { packageManager } = ctx.options
  ctx.pkg.set('packageManager', `${packageManager}@${versions[packageManager]}`)
  ctx.pkg.set('engines', { node: `>=${versions.node}` })
}

/** package.json fields and scripts shared by every Vite frontend base. */
export function applyViteProjectBasics(ctx: Context, typecheck: string) {
  ctx.pkg.set('name', ctx.options.name)
  ctx.pkg.set('version', '0.0.0')
  ctx.pkg.set('private', true)
  ctx.pkg.set('type', 'module')
  applyStandaloneFields(ctx)
  ctx.pkg.addScripts({
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
    typecheck,
  })
}
