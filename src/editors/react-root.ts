import type { Context } from '../core/context.ts'

const MAIN = 'src/main.tsx'

/**
 * Wraps `<App />` in src/main.tsx with a provider. Each call wraps the innermost
 * `<App />`, so providers applied earlier end up outermost.
 */
export async function wrapReactApp(
  ctx: Context,
  provider: { imports: string[]; open: string; close: string },
) {
  const source = await ctx.fs.read(MAIN)
  const manual = `Add ${provider.imports.map((line) => `\`${line}\``).join(', ')} to ${MAIN} and wrap \`<App />\` in \`${provider.open}\`.`
  if (source === undefined) {
    ctx.note(manual)
    return
  }
  if (source.includes(provider.open)) return

  const lines = source.split('\n')
  const appIndex = lines.findIndex((line) => line.trim() === '<App />')
  const lastImportIndex = lines.findLastIndex((line) =>
    line.startsWith('import '),
  )
  if (appIndex === -1 || lastImportIndex === -1) {
    ctx.note(manual)
    return
  }

  const indent = /^\s*/.exec(lines[appIndex] ?? '')?.[0] ?? ''
  lines.splice(
    appIndex,
    1,
    `${indent}${provider.open}`,
    `${indent}  <App />`,
    `${indent}${provider.close}`,
  )
  lines.splice(lastImportIndex + 1, 0, ...provider.imports)
  ctx.fs.write(MAIN, lines.join('\n'))
}
