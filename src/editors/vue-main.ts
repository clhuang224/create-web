import type { Context } from '../core/context.ts'

const MAIN = 'src/main.ts'

/**
 * Registers a Vue plugin in src/main.ts. Expects the `app.mount(...)` shape the
 * base template uses; anything else becomes a manual step.
 */
export async function addVueAppUse(
  ctx: Context,
  plugin: { imports: string; use: string },
) {
  const source = await ctx.fs.read(MAIN)
  const manual = `Add \`${plugin.imports}\` and \`app.use(${plugin.use})\` to ${MAIN}.`
  if (source === undefined) {
    ctx.note(manual)
    return
  }
  if (source.includes(`app.use(${plugin.use})`)) return

  const lines = source.split('\n')
  const mountIndex = lines.findIndex((line) => /^app\.mount\(/.test(line))
  const lastImportIndex = lines.findLastIndex((line) =>
    line.startsWith('import '),
  )
  if (mountIndex === -1 || lastImportIndex === -1) {
    ctx.note(manual)
    return
  }

  lines.splice(mountIndex, 0, `app.use(${plugin.use})`)
  lines.splice(lastImportIndex + 1, 0, plugin.imports)
  ctx.fs.write(MAIN, lines.join('\n'))
}
