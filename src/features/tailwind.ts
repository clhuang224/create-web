import { defineFeature } from '../core/feature.ts'
import { prependToFile } from '../editors/files.ts'
import { addVitePluginToConfig } from '../editors/vite-config.ts'
import { pick } from '../versions.ts'

export default defineFeature({
  id: 'tailwind',
  label: 'Tailwind CSS',
  kinds: ['frontend'],
  async apply(ctx) {
    ctx.pkg.addDevDependencies(pick('tailwindcss', '@tailwindcss/vite'))
    await addVitePluginToConfig(ctx, {
      from: '@tailwindcss/vite',
      constructor: 'tailwindcss',
    })
    await prependToFile(
      ctx,
      'src/style.css',
      "@import 'tailwindcss';\n\n",
      "Add `@import 'tailwindcss';` to your main stylesheet.",
    )
  },
})
