import { defineFeature } from '../core/feature.ts'
import { copyTemplate, renderTemplateFile } from '../core/template.ts'
import { replaceIfUnchanged } from '../editors/files.ts'
import { wrapReactApp } from '../editors/react-root.ts'
import { pick } from '../versions.ts'

const ROUTED_APP = `import { Route, Routes } from 'react-router'
import HomePage from './pages/HomePage.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  )
}
`

export default defineFeature({
  id: 'react-router',
  label: 'React Router',
  kinds: ['frontend'],
  frameworks: ['react'],
  async apply(ctx) {
    ctx.pkg.addDependencies(pick('react-router'))
    await copyTemplate(ctx, 'react-router')
    await wrapReactApp(ctx, {
      imports: ["import { BrowserRouter } from 'react-router'"],
      open: '<BrowserRouter basename={import.meta.env.BASE_URL}>',
      close: '</BrowserRouter>',
    })
    await replaceIfUnchanged(
      ctx,
      'src/App.tsx',
      await renderTemplateFile(ctx, 'react', 'src/App.tsx'),
      ROUTED_APP,
      'Render your routes with `<Routes>` in src/App.tsx.',
    )
  },
})
