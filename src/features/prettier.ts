import { defineFeature } from '../core/feature.ts'
import { pick } from '../versions.ts'

export const prettierOptions = {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
} as const

export default defineFeature({
  id: 'prettier',
  label: 'Prettier',
  kinds: ['frontend', 'library', 'monorepo'],
  category: 'formatter',
  conflicts: ['oxfmt'],
  async apply(ctx) {
    ctx.pkg.addDevDependencies(pick('prettier'))
    ctx.pkg.addScripts({
      format: 'prettier --write .',
      'format:check': 'prettier --check .',
    })
    await ctx.addFile(
      '.prettierrc',
      `${JSON.stringify(prettierOptions, null, 2)}\n`,
    )
    // Markdown is left alone: aligned tables with CJK text read worse after formatting.
    await ctx.addFile(
      '.prettierignore',
      ['dist', 'coverage', 'pnpm-lock.yaml', 'bun.lock', '*.md', ''].join('\n'),
    )
  },
})
