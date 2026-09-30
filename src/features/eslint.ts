import type { Context } from '../core/context.ts'
import { defineFeature } from '../core/feature.ts'
import { formatSource } from '../core/format.ts'
import { pick } from '../versions.ts'
import { syncLintScript } from './lint-script.ts'

const CONFIG = 'eslint.config.js'
const OXLINT_CONFIG = './.oxlintrc.json'

interface Options {
  /** eslint-config-prettier turns off stylistic rules that a formatter owns. */
  skipFormatting: boolean
  /** eslint-plugin-oxlint turns off rules that oxlint already checks. */
  oxlint: boolean
}

const lines = (...items: (string | false)[]) =>
  items.filter((line): line is string => line !== false).join('\n')

function vueConfig({ skipFormatting, oxlint }: Options) {
  return lines(
    "import { globalIgnores } from 'eslint/config'",
    "import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'",
    skipFormatting &&
      "import skipFormatting from 'eslint-config-prettier/flat'",
    oxlint && "import pluginOxlint from 'eslint-plugin-oxlint'",
    "import pluginVue from 'eslint-plugin-vue'",
    '',
    'export default defineConfigWithVueTs(',
    "  { name: 'app/files-to-lint', files: ['**/*.{ts,mts,tsx,vue}'] },",
    "  globalIgnores(['**/dist/**', '**/coverage/**']),",
    "  pluginVue.configs['flat/essential'],",
    '  vueTsConfigs.recommended,',
    oxlint &&
      `  ...pluginOxlint.buildFromOxlintConfigFile('${OXLINT_CONFIG}'),`,
    skipFormatting && '  skipFormatting,',
    ')',
    '',
  )
}

function reactConfig({ skipFormatting, oxlint }: Options) {
  return lines(
    "import js from '@eslint/js'",
    "import { defineConfig, globalIgnores } from 'eslint/config'",
    skipFormatting &&
      "import skipFormatting from 'eslint-config-prettier/flat'",
    oxlint && "import pluginOxlint from 'eslint-plugin-oxlint'",
    "import reactHooks from 'eslint-plugin-react-hooks'",
    "import reactRefresh from 'eslint-plugin-react-refresh'",
    "import globals from 'globals'",
    "import tseslint from 'typescript-eslint'",
    '',
    'export default defineConfig(',
    "  globalIgnores(['**/dist/**', '**/coverage/**']),",
    '  {',
    "    files: ['**/*.{ts,tsx}'],",
    '    extends: [',
    '      js.configs.recommended,',
    '      tseslint.configs.recommended,',
    '      reactHooks.configs.flat.recommended,',
    '      reactRefresh.configs.vite,',
    '    ],',
    '    languageOptions: {',
    '      globals: globals.browser,',
    '    },',
    '  },',
    oxlint &&
      `  ...pluginOxlint.buildFromOxlintConfigFile('${OXLINT_CONFIG}'),`,
    skipFormatting && '  skipFormatting,',
    ')',
    '',
  )
}

function typescriptConfig({ skipFormatting, oxlint }: Options) {
  return lines(
    "import js from '@eslint/js'",
    "import { defineConfig, globalIgnores } from 'eslint/config'",
    skipFormatting &&
      "import skipFormatting from 'eslint-config-prettier/flat'",
    oxlint && "import pluginOxlint from 'eslint-plugin-oxlint'",
    "import globals from 'globals'",
    "import tseslint from 'typescript-eslint'",
    '',
    'export default defineConfig(',
    "  globalIgnores(['**/dist/**', '**/coverage/**']),",
    '  {',
    "    files: ['**/*.ts'],",
    '    extends: [js.configs.recommended, tseslint.configs.recommended],',
    '    languageOptions: {',
    '      globals: globals.node,',
    '    },',
    '  },',
    oxlint &&
      `  ...pluginOxlint.buildFromOxlintConfigFile('${OXLINT_CONFIG}'),`,
    skipFormatting && '  skipFormatting,',
    ')',
    '',
  )
}

const configs = {
  vue: vueConfig,
  react: reactConfig,
  none: typescriptConfig,
}

const BASE_DEPENDENCIES = {
  vue: pick('eslint', 'eslint-plugin-vue', '@vue/eslint-config-typescript'),
  react: pick(
    'eslint',
    '@eslint/js',
    'typescript-eslint',
    'eslint-plugin-react-hooks',
    'eslint-plugin-react-refresh',
    'globals',
  ),
  none: pick('eslint', '@eslint/js', 'typescript-eslint', 'globals'),
}
const OPTIONAL_DEPENDENCIES = ['eslint-config-prettier', 'eslint-plugin-oxlint']

/** Adds what the config imports and drops optional plugins it no longer uses. */
function syncDependencies(ctx: Context, { skipFormatting, oxlint }: Options) {
  ctx.pkg.addDevDependencies({
    ...BASE_DEPENDENCIES[ctx.options.framework ?? 'none'],
    ...(skipFormatting ? pick('eslint-config-prettier') : {}),
    ...(oxlint ? pick('eslint-plugin-oxlint') : {}),
  })
  ctx.pkg.removeDependencies(
    [
      !skipFormatting && 'eslint-config-prettier',
      !oxlint && 'eslint-plugin-oxlint',
    ].filter((name): name is string => name !== false),
  )
}

/** Tells the user how to update an edited config by hand. */
function manualSteps(current: string, { skipFormatting, oxlint }: Options) {
  const has = (text: string) => current.includes(text)
  return [
    oxlint &&
      !has('eslint-plugin-oxlint') &&
      `add \`...pluginOxlint.buildFromOxlintConfigFile('${OXLINT_CONFIG}')\` from eslint-plugin-oxlint`,
    !oxlint && has('eslint-plugin-oxlint') && 'remove eslint-plugin-oxlint',
    skipFormatting &&
      !has('eslint-config-prettier') &&
      'add `skipFormatting` from eslint-config-prettier/flat last',
    !skipFormatting &&
      has('eslint-config-prettier') &&
      'remove eslint-config-prettier',
  ].filter((step): step is string => step !== false)
}

export default defineFeature({
  id: 'eslint',
  label: 'ESLint',
  kinds: ['frontend', 'library'],
  frameworks: ['vue', 'react'],
  category: 'linter',
  apply() {},
  // The config depends on which formatter and linters are present, so it is
  // (re)written here and follows features added later.
  async sync(ctx) {
    syncLintScript(ctx)

    const options: Options = {
      skipFormatting: ctx.has('prettier') || ctx.has('oxfmt'),
      oxlint: ctx.has('oxlint'),
    }
    const next = configs[ctx.options.framework ?? 'none'](options)
    const current = await ctx.fs.read(CONFIG)
    if (current !== undefined && current === (await formatSource(CONFIG, next)))
      return

    if (await ctx.canRegenerate(CONFIG)) {
      syncDependencies(ctx, options)
      ctx.writeGenerated(CONFIG, next)
      return
    }
    const steps = current === undefined ? [] : manualSteps(current, options)
    if (steps.length > 0) {
      ctx.note(
        `${CONFIG} was edited, so it was not updated; ${steps.join('; ')}.`,
      )
    }
  },
  async remove(ctx) {
    await ctx.removeFile(CONFIG)
    ctx.pkg.removeDependencies([
      ...new Set([
        ...Object.values(BASE_DEPENDENCIES).flatMap((deps) =>
          Object.keys(deps),
        ),
        ...OPTIONAL_DEPENDENCIES,
      ]),
    ])
    syncLintScript(ctx)
  },
})
