import type { Context } from '../core/context.ts'
import { defineFeature } from '../core/feature.ts'
import { versions } from '../versions.ts'
import { setupActionPath } from './github-actions.ts'

const PUBLISH_WORKFLOW = '.github/workflows/publish.yml'

function publishWorkflow(ctx: Context) {
  return `name: Publish

on:
  push:
    tags: ['v*']

permissions:
  contents: read
  id-token: write

jobs:
  checks:
    uses: ./.github/workflows/ci.yml

  publish:
    needs: checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ${setupActionPath(ctx)}
      - uses: actions/setup-node@v4
        with:
          node-version: ${versions.node}
          registry-url: https://registry.npmjs.org
      - run: ${ctx.run('build')}
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`
}

export default defineFeature({
  id: 'publish',
  label: 'Publish workflow',
  hint: 'publish to npm when a v* tag is pushed',
  kinds: ['library'],
  // The workflow assumes the package is at the repository root.
  standaloneOnly: true,
  requires: ['github-actions'],
  async apply(ctx) {
    await ctx.addFile(PUBLISH_WORKFLOW, publishWorkflow(ctx))
    const ci = await ctx.fs.read('.github/workflows/ci.yml')
    if (ci !== undefined && !ci.includes('workflow_call')) {
      ctx.note(
        'Add `workflow_call:` to the triggers in .github/workflows/ci.yml so publish.yml can run the checks before publishing.',
      )
    }
    ctx.note(
      'Add an NPM_TOKEN repository secret (or configure npm trusted publishing) before pushing a v* tag.',
    )
  },
  async remove(ctx) {
    await ctx.removeFile(PUBLISH_WORKFLOW, publishWorkflow(ctx))
  },
})
