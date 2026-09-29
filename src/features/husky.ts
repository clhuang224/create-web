import type { Context } from '../core/context.ts'
import { defineFeature } from '../core/feature.ts'
import { managedBlock, syncManagedBlock } from '../editors/managed-block.ts'
import { pick } from '../versions.ts'

const COMMIT_MSG = `#!/usr/bin/env sh

commit_message_file="$1"
header="$(sed -n '1p' "$commit_message_file")"

conventional_commit_pattern='^(feat|fix|docs|refactor|test|chore|build|ci|style|perf)(\\([a-z0-9-]+\\))?!?: .+$'

if ! printf '%s\\n' "$header" | grep -Eq "$conventional_commit_pattern"; then
  echo "Invalid commit message header."
  echo "Use Conventional Commits: <type>[optional scope]: <description>"
  echo "Example: feat(home): add welcome banner"
  exit 1
fi
`

const PRE_COMMIT = `#!/usr/bin/env sh

if git diff --cached --quiet -- . ':(exclude)*.md' ':(exclude)docs'; then
  echo "Only documentation files staged. Skipping checks."
  exit 0
fi

${managedBlock('checks', 'hash')}
`

const PRE_PUSH = `#!/usr/bin/env sh

${managedBlock('tests', 'hash')}
`

const scriptsPresent = (ctx: Context, scripts: string[]) =>
  scripts.filter((script) => ctx.pkg.hasScript(script))

export default defineFeature({
  id: 'husky',
  label: 'Husky',
  hint: 'Git hooks with a Conventional Commits check',
  kinds: ['frontend', 'library', 'monorepo'],
  apply(ctx) {
    ctx.pkg.addDevDependencies(pick('husky'))
    ctx.pkg.addScripts({ prepare: 'husky' })
    ctx.fs.write('.husky/commit-msg', COMMIT_MSG, { executable: true })
    ctx.fs.write('.husky/pre-commit', PRE_COMMIT, { executable: true })
    ctx.fs.write('.husky/pre-push', PRE_PUSH, { executable: true })
  },
  async sync(ctx) {
    await syncManagedBlock(ctx, '.husky/pre-commit', {
      id: 'checks',
      style: 'hash',
      lines: scriptsPresent(ctx, ['lint', 'typecheck', 'format:check']).map(
        ctx.run,
      ),
    })
    await syncManagedBlock(ctx, '.husky/pre-push', {
      id: 'tests',
      style: 'hash',
      lines: scriptsPresent(ctx, ['test']).map(ctx.run),
    })
  },
})
