import { describe, expect, it } from 'vitest'
import { createTestContext } from '../core/test-context.ts'
import { managedBlock, syncManagedBlock } from './managed-block.ts'

const createContext = () => createTestContext('add')

describe('syncManagedBlock', () => {
  it('rewrites only the block and keeps user lines around it', async () => {
    const { ctx, fs } = createContext()
    fs.write(
      'hook',
      `echo before\n${managedBlock('checks', 'hash')}\necho after\n`,
    )

    await syncManagedBlock(ctx, 'hook', {
      id: 'checks',
      style: 'hash',
      lines: ['pnpm run lint'],
    })
    await syncManagedBlock(ctx, 'hook', {
      id: 'checks',
      style: 'hash',
      lines: ['pnpm run test'],
    })

    expect(await fs.read('hook')).toBe(
      'echo before\n# create-web:start checks\npnpm run test\n# create-web:end checks\necho after\n',
    )
  })

  it('keeps the indentation of the markers', async () => {
    const { ctx, fs } = createContext()
    fs.write('ci.yml', `matrix:\n${managedBlock('checks', 'hash', '  ')}\n`)

    await syncManagedBlock(ctx, 'ci.yml', {
      id: 'checks',
      style: 'hash',
      lines: ["command: ['lint']"],
    })

    expect(await fs.read('ci.yml')).toContain("\n  command: ['lint']\n")
  })

  it('reports a manual step when the markers were removed', async () => {
    const { ctx, fs, notes } = createContext()
    fs.write('AGENTS.md', '# Guide\n')

    await syncManagedBlock(ctx, 'AGENTS.md', {
      id: 'commands',
      style: 'html',
      lines: ['- x'],
    })

    expect(await fs.read('AGENTS.md')).toBe('# Guide\n')
    expect(notes).toHaveLength(1)
  })
})
