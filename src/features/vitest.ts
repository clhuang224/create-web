import { defineFeature } from '../core/feature.ts'
import { copyTemplate } from '../core/template.ts'
import { updateJson } from '../editors/files.ts'
import { pick } from '../versions.ts'

interface TsconfigReferences {
  references?: { path: string }[]
}

export default defineFeature({
  id: 'vitest',
  label: 'Vitest',
  hint: 'unit tests',
  kinds: ['frontend'],
  frameworks: ['vue'],
  async apply(ctx) {
    ctx.pkg.addDevDependencies(
      pick('vitest', '@vue/test-utils', 'jsdom', '@types/jsdom'),
    )
    ctx.pkg.addScripts({ test: 'vitest run', 'test:watch': 'vitest' })
    await copyTemplate(ctx, 'vitest-vue')

    const referenced = await updateJson<TsconfigReferences>(
      ctx,
      'tsconfig.json',
      (tsconfig) => {
        const references = tsconfig.references ?? []
        if (!references.some((ref) => ref.path === './tsconfig.vitest.json')) {
          references.push({ path: './tsconfig.vitest.json' })
        }
        tsconfig.references = references
      },
    )
    if (!referenced)
      ctx.note(
        'Add `{ "path": "./tsconfig.vitest.json" }` to the references in tsconfig.json.',
      )
  },
})
