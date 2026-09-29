import type { Context } from '../core/context.ts'
import type { PackageManager } from '../core/types.ts'
import { copyTemplate } from '../core/template.ts'
import { applyStandaloneFields } from './common.ts'

export const WORKSPACE_GLOBS = ['apps/*', 'packages/*']

/** Root scripts fan out to every workspace that defines the script. */
function recursive(packageManager: PackageManager, script: string) {
  if (packageManager === 'bun') return `bun run --filter '*' ${script}`
  return script === 'dev'
    ? 'pnpm -r --parallel --if-present run dev'
    : `pnpm -r --if-present run ${script}`
}

export async function applyMonorepoBase(ctx: Context) {
  await copyTemplate(ctx, 'monorepo')

  const { packageManager } = ctx.options
  ctx.pkg.set('name', ctx.options.name)
  ctx.pkg.set('private', true)
  ctx.pkg.set('type', 'module')
  applyStandaloneFields(ctx)

  if (packageManager === 'pnpm') {
    ctx.fs.write(
      'pnpm-workspace.yaml',
      `packages:\n${WORKSPACE_GLOBS.map((glob) => `  - ${glob}`).join('\n')}\n`,
    )
  } else {
    ctx.pkg.set('workspaces', WORKSPACE_GLOBS)
  }

  ctx.pkg.addScripts(
    Object.fromEntries(
      ['dev', 'build', 'lint', 'typecheck', 'test'].map((script) => [
        script,
        recursive(packageManager, script),
      ]),
    ),
  )
}
