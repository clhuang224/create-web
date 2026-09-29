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
  frameworks: ['vue', 'react'],
  async apply(ctx) {
    ctx.pkg.addScripts({ test: 'vitest run', 'test:watch': 'vitest' })

    if (ctx.options.framework === 'react') {
      ctx.pkg.addDevDependencies(
        pick(
          'vitest',
          'jsdom',
          '@testing-library/react',
          '@testing-library/dom',
        ),
      )
      // React tests live in src and are type-checked by tsconfig.app.json.
      await copyTemplate(ctx, 'vitest-react')
      return
    }

    ctx.pkg.addDevDependencies(
      pick('vitest', '@vue/test-utils', 'jsdom', '@types/jsdom'),
    )
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
    if (!referenced) {
      ctx.note(
        'Add `{ "path": "./tsconfig.vitest.json" }` to the references in tsconfig.json.',
      )
    }
  },
})
