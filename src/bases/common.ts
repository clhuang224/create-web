import type { Context } from '../core/context.ts'
import { versions } from '../versions.ts'

/** package.json fields and scripts shared by every Vite frontend base. */
export function applyViteProjectBasics(ctx: Context, typecheck: string) {
  const { packageManager } = ctx.options
  ctx.pkg.set('name', ctx.options.name)
  ctx.pkg.set('version', '0.0.0')
  ctx.pkg.set('private', true)
  ctx.pkg.set('type', 'module')
  ctx.pkg.set('packageManager', `${packageManager}@${versions[packageManager]}`)
  ctx.pkg.set('engines', { node: `>=${versions.node}` })
  ctx.pkg.addScripts({
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
    typecheck,
  })
}
