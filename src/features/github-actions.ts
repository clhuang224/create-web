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

const CI_WORKFLOW = '.github/workflows/ci.yml'

function setupActionFile(ctx: Context) {
  return `.github/actions/setup-${ctx.options.packageManager}/action.yml`
}

function ciWorkflow(ctx: Context) {
  return `name: CI

on:
  pull_request:
  push:
    branches: [main]
  # Lets publish workflows run the same checks before publishing.
  workflow_call:

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
`
}

export default defineFeature({
  id: 'github-actions',
  label: 'GitHub Actions',
  hint: 'CI checks on pull requests',
  kinds: ['frontend', 'library', 'monorepo'],
  async apply(ctx) {
    await ctx.addFile(setupActionFile(ctx), setupAction(ctx))
    await ctx.addFile(CI_WORKFLOW, ciWorkflow(ctx))
  },
  async remove(ctx) {
    await ctx.removeFile(setupActionFile(ctx), setupAction(ctx))
    await ctx.removeFile(CI_WORKFLOW, ciWorkflow(ctx), {
      ignoreManagedBlocks: true,
    })
  },
  async sync(ctx) {
    const checks = [
      'lint',
      'typecheck',
      'format:check',
      'test',
      'build',
    ].filter((script) => ctx.pkg.hasScript(script))
    await syncManagedBlock(ctx, CI_WORKFLOW, {
      id: 'checks',
      style: 'hash',
      lines: [`command: [${checks.map((script) => `'${script}'`).join(', ')}]`],
    })
  },
})
