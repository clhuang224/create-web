import { defineFeature } from '../core/feature.ts'
import { copyTemplate } from '../core/template.ts'
import { addVueAppUse } from '../editors/vue-main.ts'
import { pick } from '../versions.ts'

export default defineFeature({
  id: 'pinia',
  label: 'Pinia',
  hint: 'state management',
  kinds: ['frontend'],
  frameworks: ['vue'],
  async apply(ctx) {
    ctx.pkg.addDependencies(pick('pinia'))
    await copyTemplate(ctx, 'pinia')
    await addVueAppUse(ctx, {
      imports: "import { createPinia } from 'pinia'",
      use: 'createPinia()',
    })
  },
})
