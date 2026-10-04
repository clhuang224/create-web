import type { Context } from '../core/context.ts'
import { defineFeature } from '../core/feature.ts'
import { renderTemplateFile } from '../core/template.ts'
import { updateJson } from '../editors/files.ts'
import { pick } from '../versions.ts'
import { removeFeatureDependencies } from './remove-dependencies.ts'

interface TsconfigReferences {
  references?: { path: string }[]
}

const SCRIPTS = { test: 'vitest run', 'test:watch': 'vitest' }
const VITEST_REFERENCE = './tsconfig.vitest.json'

interface Sample {
  /** Sample test, relative to the template directory. */
  path: string
  /** Why the sample cannot be added, or undefined when the code it tests exists. */
  missing(ctx: Context): Promise<string | undefined>
}

const componentSample = (path: string, component: string): Sample => ({
  path,
  missing: async (ctx) =>
    (await ctx.fs.exists(component))
      ? undefined
      : `${component} no longer exists`,
})

const GREET_EXPORT =
  /export\s+(?:async\s+)?function\s+greet\b|export\s+(?:const|let|var)\s+greet\b|export\s*\{[^}]*\bgreet\b[^}]*\}/

/** Template, its files and test dependencies per project type. */
function setup(ctx: Context): {
  template: string
  /** Config files, relative to the template directory. */
  files: string[]
  sample: Sample
  dependencies: Record<string, string>
} {
  if (ctx.options.kind === 'library') {
    return {
      template: 'vitest-library',
      files: ['vitest.config.ts'],
      sample: {
        path: 'src/index.test.ts',
        missing: async (ctx) => {
          const index = await ctx.fs.read('src/index.ts')
          return index !== undefined && GREET_EXPORT.test(index)
            ? undefined
            : 'src/index.ts no longer exports greet'
        },
      },
      dependencies: pick('vitest'),
    }
  }
  if (ctx.options.framework === 'react') {
    return {
      template: 'vitest-react',
      files: ['vitest.config.ts'],
      sample: componentSample(
        'src/components/__tests__/HelloWorld.test.tsx',
        'src/components/HelloWorld.tsx',
      ),
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
    files: ['vitest.config.ts', 'tsconfig.vitest.json'],
    sample: componentSample(
      'src/components/__tests__/HelloWorld.spec.ts',
      'src/components/HelloWorld.vue',
    ),
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
    const { template, files, sample, dependencies } = setup(ctx)
    ctx.pkg.addScripts(SCRIPTS)
    ctx.pkg.addDevDependencies(dependencies)
    for (const file of files) {
      await ctx.addFile(file, await renderTemplateFile(ctx, template, file))
    }
    // The sample tests the base project's code; the user may have replaced it.
    const missing = await sample.missing(ctx)
    if (missing === undefined) {
      await ctx.addFile(
        sample.path,
        await renderTemplateFile(ctx, template, sample.path),
      )
    } else {
      ctx.note(
        `No sample test was added because ${missing}; add your own tests next to the code they cover.`,
      )
    }

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
    const { template, files, sample, dependencies } = setup(ctx)
    const scripts = ctx.pkg.removeScripts(SCRIPTS)
    const kept: string[] = []
    for (const file of [...files, sample.path]) {
      const content = await renderTemplateFile(ctx, template, file)
      if (!(await ctx.removeFile(file, content))) kept.push(file)
    }
    removeFeatureDependencies(ctx, Object.keys(dependencies), {
      files: kept,
      scripts,
    })

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
