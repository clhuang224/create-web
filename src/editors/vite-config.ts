import { generateCode, parseModule } from 'magicast'
import { addVitePlugin } from 'magicast/helpers'
import type { Context } from '../core/context.ts'

const VITE_CONFIG = 'vite.config.ts'

export async function addVitePluginToConfig(
  ctx: Context,
  plugin: { from: string; constructor: string; imported?: string },
) {
  const source = await ctx.fs.read(VITE_CONFIG)
  const manual = `Add \`${plugin.constructor}()\` from "${plugin.from}" to the plugins in ${VITE_CONFIG}.`
  if (source === undefined) {
    ctx.note(manual)
    return
  }
  if (
    source.includes(`'${plugin.from}'`) ||
    source.includes(`"${plugin.from}"`)
  )
    return

  try {
    const mod = parseModule(source)
    addVitePlugin(mod, plugin)
    ctx.fs.write(VITE_CONFIG, generateCode(mod).code)
  } catch {
    ctx.note(manual)
  }
}
