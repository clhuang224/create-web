import type { Context } from '../core/context.ts'
import type { Framework } from '../core/types.ts'
import { applyReactBase } from './react.ts'
import { applyVueBase } from './vue.ts'

export const bases: Record<Framework, (ctx: Context) => Promise<void>> = {
  vue: applyVueBase,
  react: applyReactBase,
}
