import { describe, expect, it } from 'vitest'
import { copyTemplate } from './template.ts'
import { createTestContext } from './test-context.ts'

describe('copyTemplate', () => {
  it('turns a single leading underscore into a dot but keeps __tests__', async () => {
    const { ctx, fs } = createTestContext()
    await copyTemplate(ctx, 'vue')
    await copyTemplate(ctx, 'vitest-vue')

    expect(fs.changedPaths()).toContain('.gitignore')
    expect(fs.changedPaths()).toContain(
      'src/components/__tests__/HelloWorld.spec.ts',
    )
    expect(await fs.read('index.html')).toContain('<title>demo</title>')
  })
})
