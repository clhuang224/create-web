import type { Context } from '../core/context.ts'
import { defineFeature } from '../core/feature.ts'
import { managedBlock, syncManagedBlock } from '../editors/managed-block.ts'
import { versions } from '../versions.ts'

export function setupActionPath(ctx: Context) {
  return `./.github/actions/setup-${ctx.options.packageManager}`
}

function setupAction(ctx: Context) {
  if (ctx.options.packageManager === 'bun') {
    return `name: Setup bun
description: Set up bun and install dependencies.

runs:
  using: composite
  steps:
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version: ${versions.bun}

    - run: bun install --frozen-lockfile
      shell: bash
`
  }
  return `name: Setup pnpm
description: Set up pnpm and Node.js, and install dependencies.

runs:
  using: composite
  steps:
    - uses: pnpm/action-setup@v4

    - uses: actions/setup-node@v4
      with:
        node-version: ${versions.node}
        cache: pnpm

    - run: pnpm install --frozen-lockfile
      shell: bash
`
}

export default defineFeature({
  id: 'github-actions',
  label: 'GitHub Actions',
  hint: 'CI checks on pull requests',
  kinds: ['frontend', 'library', 'monorepo'],
  apply(ctx) {
    ctx.fs.write(
      `.github/actions/setup-${ctx.options.packageManager}/action.yml`,
      setupAction(ctx),
    )
    ctx.fs.write(
      '.github/workflows/ci.yml',
      `name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  checks:
    name: \${{ matrix.command }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
${managedBlock('checks', 'hash', '        ')}
    steps:
      - uses: actions/checkout@v5
      - uses: ${setupActionPath(ctx)}
      - run: ${ctx.options.packageManager} run \${{ matrix.command }}
`,
    )
  },
  async sync(ctx) {
    const checks = [
      'lint',
      'typecheck',
      'format:check',
      'test',
      'build',
    ].filter((script) => ctx.pkg.hasScript(script))
    await syncManagedBlock(ctx, '.github/workflows/ci.yml', {
      id: 'checks',
      style: 'hash',
      lines: [`command: [${checks.map((script) => `'${script}'`).join(', ')}]`],
    })
  },
})
