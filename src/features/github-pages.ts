import type { Context } from '../core/context.ts'
import { defineFeature } from '../core/feature.ts'
import { setupActionPath } from './github-actions.ts'

const DEPLOY_WORKFLOW = '.github/workflows/deploy.yml'

function deployWorkflow(ctx: Context) {
  // Without a custom domain the site is served from /<repo>/, so pass the base path to Vite.
  const build = ctx.options.pagesDomain
    ? ctx.run('build')
    : `${ctx.run('build')} --base=/\${{ github.event.repository.name }}/`
  return `name: Deploy

# Deploys only after CI passes on main, so a failing commit never goes live.
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          # Deploy exactly the commit CI checked.
          ref: \${{ github.event.workflow_run.head_sha }}
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
`
}

export default defineFeature({
  id: 'github-pages',
  label: 'GitHub Pages',
  hint: 'deploy after CI passes on main',
  kinds: ['frontend'],
  // The deploy workflow assumes the app is at the repository root.
  standaloneOnly: true,
  requires: ['github-actions'],
  async apply(ctx) {
    const { pagesDomain } = ctx.options
    if (pagesDomain) await ctx.addFile('public/CNAME', `${pagesDomain}\n`)
    await ctx.addFile(DEPLOY_WORKFLOW, deployWorkflow(ctx))
  },
  async remove(ctx) {
    const { pagesDomain } = ctx.options
    if (pagesDomain) await ctx.removeFile('public/CNAME', `${pagesDomain}\n`)
    await ctx.removeFile(DEPLOY_WORKFLOW, deployWorkflow(ctx))
  },
})
