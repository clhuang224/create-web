import { defineFeature } from '../core/feature.ts'
import { versions } from '../versions.ts'
import { setupActionPath } from './github-actions.ts'

export default defineFeature({
  id: 'publish',
  label: 'Publish workflow',
  hint: 'publish to npm when a v* tag is pushed',
  kinds: ['library'],
  requires: ['github-actions'],
  apply(ctx) {
    ctx.fs.write(
      '.github/workflows/publish.yml',
      `name: Publish

on:
  push:
    tags: ['v*']

permissions:
  contents: read
  id-token: write

jobs:
  publish:
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
`,
    )
    ctx.note(
      'Add an NPM_TOKEN repository secret (or configure npm trusted publishing) before pushing a v* tag.',
    )
  },
})
