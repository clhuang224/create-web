import { defineFeature } from '../core/feature.ts'
import { copyTemplate } from '../core/template.ts'
import { wrapReactApp } from '../editors/react-root.ts'
import { pick } from '../versions.ts'

export default defineFeature({
  id: 'redux',
  label: 'Redux Toolkit',
  hint: 'state management',
  kinds: ['frontend'],
  frameworks: ['react'],
  async apply(ctx) {
    ctx.pkg.addDependencies(pick('@reduxjs/toolkit', 'react-redux'))
    await copyTemplate(ctx, 'redux')
    await wrapReactApp(ctx, {
      imports: [
        "import { Provider } from 'react-redux'",
        "import { store } from './store/index.ts'",
      ],
      open: '<Provider store={store}>',
      close: '</Provider>',
    })
  },
})
