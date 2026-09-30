import { defineFeature } from '../core/feature.ts'
import { pick } from '../versions.ts'
import { prettierOptions } from './prettier.ts'

const CONFIG = '.oxfmtrc.json'
const CONFIG_CONTENT = `${JSON.stringify(
  {
    $schema: './node_modules/oxfmt/configuration_schema.json',
    ...prettierOptions,
    // Match Prettier's defaults so files create-web formats also pass `oxfmt --check`.
    printWidth: 80,
    sortPackageJson: false,
    // Same as Prettier: Markdown tables with CJK text read worse after formatting.
    ignorePatterns: ['*.md', 'pnpm-lock.yaml', 'bun.lock'],
  },
  null,
  2,
)}\n`
const SCRIPTS = { format: 'oxfmt', 'format:check': 'oxfmt --check' }

export default defineFeature({
  id: 'oxfmt',
  label: 'oxfmt',
  kinds: ['frontend', 'library', 'monorepo'],
  category: 'formatter',
  conflicts: ['prettier'],
  async apply(ctx) {
    ctx.pkg.addDevDependencies(pick('oxfmt'))
    ctx.pkg.addScripts(SCRIPTS)
    await ctx.addFile(CONFIG, CONFIG_CONTENT)
  },
  async remove(ctx) {
    ctx.pkg.removeDependencies(['oxfmt'])
    ctx.pkg.removeScripts(SCRIPTS)
    await ctx.removeFile(CONFIG, CONFIG_CONTENT)
  },
})
