import type { Context } from '../core/context.ts'
import { defineFeature } from '../core/feature.ts'
import { pick } from '../versions.ts'

const lines = (...items: (string | false)[]) =>
  items.filter((line): line is string => line !== false).join('\n')

function vueConfig(withPrettier: boolean) {
  return lines(
    "import { globalIgnores } from 'eslint/config'",
    "import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'",
    "import pluginVue from 'eslint-plugin-vue'",
    withPrettier && "import skipFormatting from 'eslint-config-prettier/flat'",
    '',
    'export default defineConfigWithVueTs(',
    "  { name: 'app/files-to-lint', files: ['**/*.{ts,mts,tsx,vue}'] },",
    "  globalIgnores(['**/dist/**', '**/coverage/**']),",
    "  pluginVue.configs['flat/essential'],",
    '  vueTsConfigs.recommended,',
    withPrettier && '  skipFormatting,',
    ')',
    '',
  )
}

function reactConfig(withPrettier: boolean) {
  return lines(
    "import js from '@eslint/js'",
    "import { defineConfig, globalIgnores } from 'eslint/config'",
    withPrettier && "import skipFormatting from 'eslint-config-prettier/flat'",
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
    withPrettier && '  skipFormatting,',
    ')',
    '',
  )
}

function addDependencies(ctx: Context, withPrettier: boolean) {
  const prettier = withPrettier ? pick('eslint-config-prettier') : {}
  if (ctx.options.framework === 'react') {
    ctx.pkg.addDevDependencies({
      ...pick(
        'eslint',
        '@eslint/js',
        'typescript-eslint',
        'eslint-plugin-react-hooks',
        'eslint-plugin-react-refresh',
        'globals',
      ),
      ...prettier,
    })
  } else {
    ctx.pkg.addDevDependencies({
      ...pick('eslint', 'eslint-plugin-vue', '@vue/eslint-config-typescript'),
      ...prettier,
    })
  }
}

export default defineFeature({
  id: 'eslint',
  label: 'ESLint',
  hint: 'linter',
  kinds: ['frontend'],
  frameworks: ['vue', 'react'],
  after: ['prettier'],
  apply(ctx) {
    const withPrettier = ctx.has('prettier')
    addDependencies(ctx, withPrettier)
    ctx.pkg.addScripts({ lint: 'eslint .' })
    ctx.fs.write(
      'eslint.config.js',
      ctx.options.framework === 'react'
        ? reactConfig(withPrettier)
        : vueConfig(withPrettier),
    )
  },
})
