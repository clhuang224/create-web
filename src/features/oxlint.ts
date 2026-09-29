import { defineFeature } from '../core/feature.ts'
import { formatSource } from '../core/format.ts'
import { pick } from '../versions.ts'
import { syncLintScript } from './lint-script.ts'

const CONFIG = '.oxlintrc.json'

export default defineFeature({
  id: 'oxlint',
  label: 'oxlint',
  kinds: ['frontend', 'library'],
  frameworks: ['vue', 'react'],
  category: 'linter',
  apply(ctx) {
    ctx.pkg.addDevDependencies(pick('oxlint'))
  },
  async sync(ctx) {
    syncLintScript(ctx)

    const config = {
      $schema: './node_modules/oxlint/configuration_schema.json',
      plugins: [
        'eslint',
        'typescript',
        'unicorn',
        'oxc',
        ...(ctx.options.framework ? [ctx.options.framework] : []),
        ...(ctx.has('vitest') ? ['vitest'] : []),
      ],
      env: ctx.options.kind === 'library' ? { node: true } : { browser: true },
      categories: { correctness: 'error' },
    }
    const next = `${JSON.stringify(config, null, 2)}\n`
    const current = await ctx.fs.read(CONFIG)
    if (current !== undefined && current === (await formatSource(CONFIG, next)))
      return

    if (await ctx.canRegenerate(CONFIG)) {
      ctx.writeGenerated(CONFIG, next)
    } else {
      ctx.note(
        `${CONFIG} was edited, so it was not updated. Enabled plugins should be: ${config.plugins.join(', ')}.`,
      )
    }
  },
})
