import type { Context } from '../core/context.ts'
import { ResolveError } from '../core/resolver.ts'
import type { ProjectOptions } from '../core/types.ts'
import { applyLibraryBase } from './library.ts'
import { applyMonorepoBase } from './monorepo.ts'
import { applyReactBase } from './react.ts'
import { applyVueBase } from './vue.ts'

type Base = (ctx: Context) => Promise<void>

const frontendBases: Record<string, Base> = {
  vue: applyVueBase,
  react: applyReactBase,
}

/** Picks the base project for a kind (and framework, for frontend projects). */
export function selectBase({ kind, framework }: ProjectOptions): Base {
  switch (kind) {
    case 'frontend': {
      if (!framework)
        throw new ResolveError('Frontend projects need a framework')
      const base = Object.hasOwn(frontendBases, framework)
        ? frontendBases[framework]
        : undefined
      if (!base) throw new ResolveError(`Unknown framework: ${framework}`)
      return base
    }
    case 'library':
      if (framework)
        throw new ResolveError('Library projects do not use a framework')
      return applyLibraryBase
    case 'monorepo':
      if (framework)
        throw new ResolveError('Monorepo roots do not use a framework')
      return applyMonorepoBase
    default:
      throw new ResolveError(`${kind} projects are not supported yet`)
  }
}
