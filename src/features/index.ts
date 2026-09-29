import type { Feature } from '../core/feature.ts'
import agentDocs from './agent-docs.ts'
import eslint from './eslint.ts'
import githubActions from './github-actions.ts'
import githubPages from './github-pages.ts'
import husky from './husky.ts'
import pinia from './pinia.ts'
import prettier from './prettier.ts'
import reactRouter from './react-router.ts'
import redux from './redux.ts'
import tailwind from './tailwind.ts'
import vitest from './vitest.ts'
import vueRouter from './vue-router.ts'

/** Registry order is also the default display and apply order. */
export const features: readonly Feature[] = [
  pinia,
  vueRouter,
  redux,
  reactRouter,
  tailwind,
  vitest,
  prettier,
  eslint,
  husky,
  githubActions,
  githubPages,
  agentDocs,
]
