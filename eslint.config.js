import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Templates are linted by the generated project's own config (see pnpm run e2e).
  { ignores: ['dist', 'coverage', 'templates'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
)
