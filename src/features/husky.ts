import { defineFeature } from '../core/feature.ts'
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

export default defineFeature({
  id: 'husky',
  label: 'Husky',
  hint: 'Git hooks with a Conventional Commits check',
  kinds: ['frontend'],
  after: ['eslint', 'prettier', 'vitest'],
  apply(ctx) {
    ctx.pkg.addDevDependencies(pick('husky'))
    ctx.pkg.addScripts({ prepare: 'husky' })
    ctx.fs.write('.husky/commit-msg', COMMIT_MSG, { executable: true })

    const checks = ['lint', 'typecheck', 'format:check'].filter((script) =>
      ctx.pkg.hasScript(script),
    )
    ctx.fs.write(
      '.husky/pre-commit',
      [
        '#!/usr/bin/env sh',
        '',
        "if git diff --cached --quiet -- . ':(exclude)*.md' ':(exclude)docs'; then",
        '  echo "Only documentation files staged. Skipping checks."',
        '  exit 0',
        'fi',
        '',
        ...checks.map((script) => ctx.run(script)),
        '',
      ].join('\n'),
      { executable: true },
    )

    if (ctx.pkg.hasScript('test')) {
      ctx.fs.write(
        '.husky/pre-push',
        `#!/usr/bin/env sh\n\n${ctx.run('test')}\n`,
        { executable: true },
      )
    }
  },
})
