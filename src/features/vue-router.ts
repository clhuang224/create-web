import { defineFeature } from '../core/feature.ts'
import { copyTemplate, renderTemplateFile } from '../core/template.ts'
import { replaceIfUnchanged } from '../editors/files.ts'
import { addVueAppUse } from '../editors/vue-main.ts'
import { pick } from '../versions.ts'

const ROUTED_APP = `<template>
  <RouterView />
</template>
`

export default defineFeature({
  id: 'vue-router',
  label: 'Vue Router',
  kinds: ['frontend'],
  frameworks: ['vue'],
  async apply(ctx) {
    ctx.pkg.addDependencies(pick('vue-router'))
    await copyTemplate(ctx, 'vue-router')
    await addVueAppUse(ctx, {
      imports: "import router from './router'",
      use: 'router',
    })
    await replaceIfUnchanged(
      ctx,
      'src/App.vue',
      await renderTemplateFile(ctx, 'vue', 'src/App.vue'),
      ROUTED_APP,
      'Render `<RouterView />` in src/App.vue.',
    )
  },
})
