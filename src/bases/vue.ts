import type { Context } from '../core/context.ts'
import { copyTemplate } from '../core/template.ts'
import { pick, versions } from '../versions.ts'

export async function applyVueBase(ctx: Context) {
  await copyTemplate(ctx, 'vue')

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
    typecheck: 'vue-tsc --build',
  })
  ctx.pkg.addDependencies(pick('vue'))
  ctx.pkg.addDevDependencies(
    pick(
      'vite',
      '@vitejs/plugin-vue',
      'vue-tsc',
      'typescript',
      '@vue/tsconfig',
      '@tsconfig/node24',
      '@types/node',
    ),
  )
}
