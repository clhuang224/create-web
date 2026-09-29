import type { Context } from '../core/context.ts'
import { defineFeature } from '../core/feature.ts'

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

function agentsGuide(ctx: Context) {
  const commands = Object.entries(COMMAND_DESCRIPTIONS)
    .filter(([script]) => ctx.pkg.hasScript(script))
    .map(([script, description]) => `- \`${ctx.run(script)}\`: ${description}`)

  const sections = [
    `# ${ctx.options.name}`,
    'Project guide for coding agents and contributors. Keep it focused on rules that are specific to this project.',
    `## Documentation Ownership

- \`README.md\`: project overview and setup.
- \`docs/architecture.md\`: current architecture and boundaries.
- \`docs/plan.md\`: product direction and decisions.`,
    `## Commands\n\n${commands.join('\n')}`,
  ]

  if (ctx.has('husky')) {
    sections.push(`## Git Hooks

- \`commit-msg\`: Conventional Commits header check.
- \`pre-commit\`: lint, typecheck, and format check; skipped when only Markdown or \`docs/\` files are staged.${ctx.pkg.hasScript('test') ? '\n- `pre-push`: unit tests.' : ''}`)
  }

  sections.push(`## Commit Rules

Follow Conventional Commits: \`<type>[optional scope]: <description>\`.

Use \`feat\`, \`fix\`, \`refactor\`, \`test\`, \`docs\`, \`chore\`, \`build\`, \`ci\`, \`style\`, or \`perf\`. Keep commits small and atomic.`)

  return `${sections.join('\n\n')}\n`
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
  kinds: ['frontend'],
  after: [
    'pinia',
    'vue-router',
    'vitest',
    'eslint',
    'prettier',
    'tailwind',
    'husky',
    'github-actions',
    'github-pages',
  ],
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
})
