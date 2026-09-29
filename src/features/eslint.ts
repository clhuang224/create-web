import { defineFeature } from '../core/feature.ts'
import { pick } from '../versions.ts'

export default defineFeature({
  id: 'eslint',
  label: 'ESLint',
  hint: 'linter',
  kinds: ['frontend'],
  frameworks: ['vue'],
  after: ['prettier'],
  apply(ctx) {
    const withPrettier = ctx.has('prettier')
    ctx.pkg.addDevDependencies({
      ...pick('eslint', 'eslint-plugin-vue', '@vue/eslint-config-typescript'),
      ...(withPrettier ? pick('eslint-config-prettier') : {}),
    })
    ctx.pkg.addScripts({ lint: 'eslint .' })
    ctx.fs.write(
      'eslint.config.js',
      [
        "import { globalIgnores } from 'eslint/config'",
        "import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'",
        "import pluginVue from 'eslint-plugin-vue'",
        withPrettier &&
          "import skipFormatting from 'eslint-config-prettier/flat'",
        '',
        'export default defineConfigWithVueTs(',
        "  { name: 'app/files-to-lint', files: ['**/*.{ts,mts,tsx,vue}'] },",
        "  globalIgnores(['**/dist/**', '**/coverage/**']),",
        "  pluginVue.configs['flat/essential'],",
        '  vueTsConfigs.recommended,',
        withPrettier && '  skipFormatting,',
        ')',
        '',
      ]
        .filter((line) => line !== false)
        .join('\n'),
    )
  },
})
