import type { Context } from '../core/context.ts'
import { copyTemplate } from '../core/template.ts'
import { pick } from '../versions.ts'
import { applyViteProjectBasics } from './common.ts'

export async function applyReactBase(ctx: Context) {
  await copyTemplate(ctx, 'react')
  applyViteProjectBasics(ctx, 'tsc --build')
  ctx.pkg.addDependencies(pick('react', 'react-dom'))
  ctx.pkg.addDevDependencies(
    pick(
      'vite',
      '@vitejs/plugin-react',
      'typescript',
      '@types/react',
      '@types/react-dom',
      '@tsconfig/node24',
      '@types/node',
    ),
  )
}
