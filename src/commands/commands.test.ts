import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as p from '@clack/prompts'
import { type ArgsDef, type CommandDef, runCommand } from 'citty'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest'
import { generate } from '../core/generate.ts'
import { generateWorkspace } from '../core/workspace.ts'
import { addMemberCommand } from './add-member.ts'
import { addCommand } from './add.ts'
import { removeCommand } from './remove.ts'

vi.mock('@clack/prompts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clack/prompts')>()),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  confirm: vi.fn(async () => true),
  multiselect: vi.fn(async () => []),
  select: vi.fn(),
  text: vi.fn(),
  log: { step: vi.fn(), warn: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

let root: string
let cwd: MockInstance
const tty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'create-web-commands-'))
  cwd = vi.spyOn(process, 'cwd').mockReturnValue(root)
  Object.defineProperty(process.stdin, 'isTTY', {
    value: true,
    configurable: true,
  })
})
afterEach(async () => {
  cwd.mockRestore()
  if (tty) Object.defineProperty(process.stdin, 'isTTY', tty)
  else Reflect.deleteProperty(process.stdin, 'isTTY')
  process.exitCode = undefined
  vi.clearAllMocks()
  await rm(root, { recursive: true, force: true })
})

function run<T extends ArgsDef>(
  command: CommandDef<T>,
  rawArgs: string[],
  dir = root,
) {
  cwd.mockReturnValue(dir)
  return runCommand(command, { rawArgs: [...rawArgs, '--no-install'] })
}

async function createWorkspace(
  members: Parameters<typeof generateWorkspace>[0]['members'],
) {
  const { projects } = await generateWorkspace({
    root,
    options: {
      name: 'demo',
      kind: 'monorepo',
      packageManager: 'pnpm',
      features: ['prettier', 'husky'],
    },
    members,
  })
  for (const { result } of projects) await result.fs.commit()
}

const multiselectOptions = () =>
  vi
    .mocked(p.multiselect)
    .mock.calls[0]?.[0].options.map((option) => option.value)

describe('add (interactive)', () => {
  beforeEach(async () => {
    const { fs } = await generate({
      root,
      mode: 'create',
      options: {
        name: 'demo',
        kind: 'frontend',
        framework: 'vue',
        packageManager: 'pnpm',
        features: ['prettier', 'eslint'],
      },
    })
    await fs.commit()
  })

  it('does not offer features that conflict with present ones', async () => {
    await run(addCommand, ['--yes'])
    const offered = multiselectOptions()
    expect(offered).toContain('oxlint')
    expect(offered).not.toContain('oxfmt')
    expect(offered).not.toContain('prettier')
  })

  it('accepts an empty selection', async () => {
    await run(addCommand, ['--yes'])
    expect(vi.mocked(p.multiselect).mock.calls[0]?.[0].required).toBe(false)
    expect(p.outro).toHaveBeenCalledWith('Nothing added.')
    expect(process.exitCode).toBeUndefined()
  })
})

describe('add / remove at a monorepo root', () => {
  it('updates members and lists their files', async () => {
    await createWorkspace([
      { name: 'web', kind: 'frontend', framework: 'vue', features: ['eslint'] },
    ])
    const config = join(root, 'apps/web/eslint.config.js')

    await run(removeCommand, ['prettier', '--yes'])
    expect(await readFile(config, 'utf8')).not.toContain('skipFormatting')
    const [preview] = vi.mocked(p.note).mock.calls[0] ?? []
    expect(preview).toContain('.prettierrc (delete)')
    expect(preview).toContain('apps/web/eslint.config.js')

    // An edited member config is kept, and the note says which member it is.
    await writeFile(config, `// mine\n${await readFile(config, 'utf8')}`)
    vi.mocked(p.note).mockClear()
    await run(addCommand, ['oxfmt', '--yes'])
    expect(await readFile(config, 'utf8')).not.toContain('skipFormatting')
    expect(vi.mocked(p.note).mock.calls[1]?.[0]).toMatch(
      /^- apps\/web: eslint\.config\.js was edited/,
    )
  })
})

describe('add-member', () => {
  it('rejects a name another member already uses', async () => {
    await createWorkspace([
      { name: 'ui', kind: 'frontend', framework: 'vue', features: [] },
    ])
    await run(addMemberCommand, ['ui', '--type', 'library', '--yes'])
    expect(p.cancel).toHaveBeenCalledWith('apps/ui already uses the name "ui".')
    expect(process.exitCode).toBe(1)
    await expect(
      readFile(join(root, 'packages/ui/package.json')),
    ).rejects.toThrow()
  })

  it('rejects names the root ignores', async () => {
    await createWorkspace([])
    await run(addMemberCommand, ['dist', '--type', 'library', '--yes'])
    expect(p.cancel).toHaveBeenCalledWith(
      expect.stringMatching(/"dist" cannot be a project name/),
    )
  })

  it('rejects a target path that is a file', async () => {
    await createWorkspace([])
    await mkdir(join(root, 'apps'))
    await writeFile(join(root, 'apps/ui'), 'not a directory')
    await run(addMemberCommand, ['ui', '--type', 'vue', '--yes'])
    expect(p.cancel).toHaveBeenCalledWith(
      'apps/ui exists and is not a directory.',
    )
    expect(process.exitCode).toBe(1)
  })

  it('rejects a target below a file', async () => {
    await createWorkspace([])
    await writeFile(join(root, 'apps'), 'not a directory')
    await run(addMemberCommand, ['ui', '--type', 'vue', '--yes'])
    expect(p.cancel).toHaveBeenCalledWith(
      'Cannot create apps/ui: a parent path is not a directory.',
    )
  })
})
