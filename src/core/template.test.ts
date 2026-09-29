import { describe, expect, it } from 'vitest'
import { presetFeatures, presets } from '../presets.ts'
import type { Context } from './context.ts'
import { PackageJsonEditor } from './package-json.ts'
import { copyTemplate } from './template.ts'
import { VirtualFs } from './vfs.ts'

describe('copyTemplate', () => {
  it('turns a single leading underscore into a dot but keeps __tests__', async () => {
    const fs = new VirtualFs('/nonexistent')
    const ctx: Context = {
      mode: 'create',
      options: {
        name: 'demo',
        kind: 'frontend',
        ...presets.lynn,
        features: presetFeatures(presets.lynn, 'vue'),
      },
      fs,
      pkg: new PackageJsonEditor({}),
      has: () => false,
      run: (script) => `pnpm run ${script}`,
      note: () => {},
    }
    await copyTemplate(ctx, 'vue')
    await copyTemplate(ctx, 'vitest-vue')

    expect(fs.changedPaths()).toContain('.gitignore')
    expect(fs.changedPaths()).toContain(
      'src/components/__tests__/HelloWorld.spec.ts',
    )
    expect(await fs.read('index.html')).toContain('<title>demo</title>')
  })
})
