import type { Context } from '../core/context.ts'
import { defineFeature } from '../core/feature.ts'
import { managedBlock, syncManagedBlock } from '../editors/managed-block.ts'

const COMMAND_DESCRIPTIONS: Record<string, string> = {
  dev: 'start the dev server',
  build: 'build for production',
  preview: 'preview the production build',
  typecheck: 'type-check the project',
  lint: 'lint the project',
  format: 'format files',
  'format:check': 'check formatting',
  test: 'run unit tests',
}

const LIBRARY_COMMAND_DESCRIPTIONS: Record<string, string> = {
  dev: 'rebuild on change',
  build: 'build the package into dist/',
}

function commandLines(ctx: Context) {
  const descriptions =
    ctx.options.kind === 'library'
      ? { ...COMMAND_DESCRIPTIONS, ...LIBRARY_COMMAND_DESCRIPTIONS }
      : COMMAND_DESCRIPTIONS
  return Object.entries(descriptions)
    .filter(([script]) => ctx.pkg.hasScript(script))
    .map(([script, description]) => `- \`${ctx.run(script)}\`: ${description}`)
}

function hookLines(ctx: Context) {
  if (!ctx.has('husky')) return []
  return [
    '## Git Hooks',
    '',
    '- `commit-msg`: Conventional Commits header check.',
    '- `pre-commit`: lint, typecheck, and format check; skipped when only Markdown or `docs/` files are staged.',
    ...(ctx.pkg.hasScript('test') ? ['- `pre-push`: unit tests.'] : []),
  ]
}

function workspaceSection(ctx: Context) {
  const filter =
    ctx.options.packageManager === 'bun'
      ? 'bun run --filter <name> <script>'
      : 'pnpm --filter <name> <script>'
  return `## Workspace Layout

- \`apps/*\`: applications.
- \`packages/*\`: shared packages and libraries.

Each project has its own \`.create-web.json\`; run \`create-web add\` inside a project to add project-level features (linters, tests, frameworks). Formatting, Git hooks, CI, and these docs live at the root.

Root scripts run in every workspace that defines them. To target one project, use \`${filter}\`.

`
}

function agentsGuide(ctx: Context) {
  return `# ${ctx.options.name}

Project guide for coding agents and contributors. Keep it focused on rules that are specific to this project.

## Documentation Ownership

- \`README.md\`: project overview and setup.
- \`docs/architecture.md\`: current architecture and boundaries.
- \`docs/plan.md\`: product direction and decisions.

${ctx.options.kind === 'monorepo' ? workspaceSection(ctx) : ''}## Commands

${managedBlock('commands', 'html')}

${managedBlock('git-hooks', 'html')}

## Commit Rules

Follow Conventional Commits: \`<type>[optional scope]: <description>\`.

Use \`feat\`, \`fix\`, \`refactor\`, \`test\`, \`docs\`, \`chore\`, \`build\`, \`ci\`, \`style\`, or \`perf\`. Keep commits small and atomic.
`
}

const DOCS: Record<string, string> = {
  'docs/plan.md': `# Plan

Product direction and decisions. Record why a decision was made, not only what it is.

## Goals

## Decisions

## Open Questions
`,
  'docs/architecture.md': `# Architecture

Current architecture and boundaries.

## Structure

## Data Flow
`,
}

export default defineFeature({
  id: 'agent-docs',
  label: 'Agent docs',
  hint: 'AGENTS.md, CLAUDE.md, docs/plan.md, docs/architecture.md',
  kinds: ['frontend', 'library', 'monorepo'],
  async apply(ctx) {
    const files: Record<string, string> = {
      'AGENTS.md': agentsGuide(ctx),
      // Claude Code reads CLAUDE.md; import AGENTS.md so both tools share one guide.
      'CLAUDE.md': '@AGENTS.md\n',
      ...DOCS,
    }
    for (const [path, content] of Object.entries(files)) {
      if (await ctx.fs.exists(path)) {
        ctx.note(`${path} already exists and was left unchanged.`)
      } else {
        ctx.fs.write(path, content)
      }
    }
  },
  async sync(ctx) {
    await syncManagedBlock(ctx, 'AGENTS.md', {
      id: 'commands',
      style: 'html',
      lines: commandLines(ctx),
    })
    await syncManagedBlock(ctx, 'AGENTS.md', {
      id: 'git-hooks',
      style: 'html',
      lines: hookLines(ctx),
    })
  },
})
