import { defineFeature } from '../core/feature.ts'
import { pick } from '../versions.ts'
import { prettierOptions } from './prettier.ts'

export default defineFeature({
  id: 'oxfmt',
  label: 'oxfmt',
  kinds: ['frontend', 'library'],
  category: 'formatter',
  conflicts: ['prettier'],
  apply(ctx) {
    ctx.pkg.addDevDependencies(pick('oxfmt'))
    ctx.pkg.addScripts({ format: 'oxfmt', 'format:check': 'oxfmt --check' })
    ctx.fs.write(
      '.oxfmtrc.json',
      `${JSON.stringify(
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
      )}\n`,
    )
  },
})
