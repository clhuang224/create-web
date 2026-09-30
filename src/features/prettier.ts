import { defineFeature } from '../core/feature.ts'
import { pick } from '../versions.ts'

export const prettierOptions = {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
} as const

const PRETTIERRC = `${JSON.stringify(prettierOptions, null, 2)}\n`
// Markdown is left alone: aligned tables with CJK text read worse after formatting.
const PRETTIERIGNORE = [
  'dist',
  'coverage',
  'pnpm-lock.yaml',
  'bun.lock',
  '*.md',
  '',
].join('\n')
const SCRIPTS = {
  format: 'prettier --write .',
  'format:check': 'prettier --check .',
}

export default defineFeature({
  id: 'prettier',
  label: 'Prettier',
  kinds: ['frontend', 'library', 'monorepo'],
  category: 'formatter',
  conflicts: ['oxfmt'],
  async apply(ctx) {
    ctx.pkg.addDevDependencies(pick('prettier'))
    ctx.pkg.addScripts(SCRIPTS)
    await ctx.addFile('.prettierrc', PRETTIERRC)
    await ctx.addFile('.prettierignore', PRETTIERIGNORE)
  },
  async remove(ctx) {
    ctx.pkg.removeDependencies(['prettier'])
    ctx.pkg.removeScripts(SCRIPTS)
    await ctx.removeFile('.prettierrc', PRETTIERRC)
    await ctx.removeFile('.prettierignore', PRETTIERIGNORE)
  },
})
