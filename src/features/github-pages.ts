import { defineFeature } from '../core/feature.ts'
import { setupActionPath } from './github-actions.ts'

export default defineFeature({
  id: 'github-pages',
  label: 'GitHub Pages',
  hint: 'deploy on push to main',
  kinds: ['frontend'],
  requires: ['github-actions'],
  apply(ctx) {
    const { pagesDomain } = ctx.options
    if (pagesDomain) ctx.fs.write('public/CNAME', `${pagesDomain}\n`)

    // Without a custom domain the site is served from /<repo>/, so pass the base path to Vite.
    const build = pagesDomain
      ? ctx.run('build')
      : `${ctx.run('build')} --base=/\${{ github.event.repository.name }}/`

    ctx.fs.write(
      '.github/workflows/deploy.yml',
      `name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ${setupActionPath(ctx)}
      - uses: actions/configure-pages@v5
      - run: ${build}
      # GitHub Pages has no SPA rewrites; serve the app for unknown paths.
      - run: cp dist/index.html dist/404.html
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`,
    )
  },
})
