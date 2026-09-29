import type { Context } from '../core/context.ts'
import { copyTemplate } from '../core/template.ts'
import { pick } from '../versions.ts'
import { applyStandaloneFields } from './common.ts'

export async function applyLibraryBase(ctx: Context) {
  await copyTemplate(ctx, 'library')

  const { name } = ctx.options
  ctx.pkg.set('name', name)
  ctx.pkg.set('version', '0.0.0')
  ctx.pkg.set('description', '')
  ctx.pkg.set('type', 'module')
  ctx.pkg.set('exports', {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.js',
    },
  })
  ctx.pkg.set('files', ['dist'])
  if (name.startsWith('@')) ctx.pkg.set('publishConfig', { access: 'public' })
  applyStandaloneFields(ctx)
  ctx.pkg.addScripts({
    dev: 'tsdown --watch',
    build: 'tsdown',
    typecheck: 'tsc --noEmit',
    prepublishOnly: ctx.run('build'),
  })
  ctx.pkg.addDevDependencies(pick('tsdown', 'typescript', '@types/node'))

  ctx.note(
    'Add a license (a LICENSE file and the "license" field in package.json) before publishing.',
  )
}
