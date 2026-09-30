import type { Context } from '../core/context.ts'
import { defineFeature } from '../core/feature.ts'
import { copyTemplate, removeTemplate } from '../core/template.ts'
import { updateJson } from '../editors/files.ts'
import { pick } from '../versions.ts'

interface TsconfigReferences {
  references?: { path: string }[]
}

const SCRIPTS = { test: 'vitest run', 'test:watch': 'vitest' }
const VITEST_REFERENCE = './tsconfig.vitest.json'

/** Template and test dependencies per project type. */
function setup(ctx: Context) {
  if (ctx.options.kind === 'library') {
    return { template: 'vitest-library', dependencies: pick('vitest') }
  }
  if (ctx.options.framework === 'react') {
    return {
      template: 'vitest-react',
      dependencies: pick(
        'vitest',
        'jsdom',
        '@testing-library/react',
        '@testing-library/dom',
      ),
    }
  }
  return {
    template: 'vitest-vue',
    dependencies: pick('vitest', '@vue/test-utils', 'jsdom', '@types/jsdom'),
  }
}

export default defineFeature({
  id: 'vitest',
  label: 'Vitest',
  hint: 'unit tests',
  kinds: ['frontend', 'library'],
  frameworks: ['vue', 'react'],
  async apply(ctx) {
    const { template, dependencies } = setup(ctx)
    ctx.pkg.addScripts(SCRIPTS)
    ctx.pkg.addDevDependencies(dependencies)
    await copyTemplate(ctx, template)

    // Vue type-checks tests with their own tsconfig; React and library tests
    // are covered by the main one.
    if (template !== 'vitest-vue') return
    const referenced = await updateJson<TsconfigReferences>(
      ctx,
      'tsconfig.json',
      (tsconfig) => {
        const references = tsconfig.references ?? []
        if (!references.some((ref) => ref.path === VITEST_REFERENCE)) {
          references.push({ path: VITEST_REFERENCE })
        }
        tsconfig.references = references
      },
    )
    if (!referenced) {
      ctx.note(
        `Add \`{ "path": "${VITEST_REFERENCE}" }\` to the references in tsconfig.json.`,
      )
    }
  },
  async remove(ctx) {
    const { template, dependencies } = setup(ctx)
    ctx.pkg.removeScripts(SCRIPTS)
    ctx.pkg.removeDependencies(Object.keys(dependencies))
    await removeTemplate(ctx, template)

    if (template !== 'vitest-vue') return
    const updated = await updateJson<TsconfigReferences>(
      ctx,
      'tsconfig.json',
      (tsconfig) => {
        tsconfig.references = tsconfig.references?.filter(
          (ref) => ref.path !== VITEST_REFERENCE,
        )
      },
    )
    if (!updated) {
      ctx.note(
        `Remove \`{ "path": "${VITEST_REFERENCE}" }\` from the references in tsconfig.json.`,
      )
    }
  },
})
