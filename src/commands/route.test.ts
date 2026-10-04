import { defineCommand, runCommand } from 'citty'
import { describe, expect, it } from 'vitest'
import { routeArgs } from './route.ts'

const subCommands = { create: {}, add: {}, remove: {}, 'add-member': {} }

describe('routeArgs', () => {
  it('keeps subcommands and top-level flags as they are', () => {
    expect(routeArgs(['add', 'vitest'], subCommands)).toEqual(['add', 'vitest'])
    expect(routeArgs(['--version'], subCommands)).toEqual(['--version'])
    expect(routeArgs(['-h'], subCommands)).toEqual(['-h'])
  })

  it('routes everything else to create', () => {
    expect(routeArgs([], subCommands)).toEqual(['create'])
    expect(routeArgs(['my-app', '--yes'], subCommands)).toEqual([
      'create',
      'my-app',
      '--yes',
    ])
  })

  it('treats Object.prototype keys as directory names', () => {
    for (const dir of [
      'constructor',
      'valueOf',
      'hasOwnProperty',
      'toString',
    ]) {
      expect(routeArgs([dir, '--yes'], subCommands)).toEqual([
        'create',
        dir,
        '--yes',
      ])
    }
  })

  it('reaches create through citty with the directory as its argument', async () => {
    const received: { command: string; dir: unknown }[] = []
    const command = (name: string) =>
      defineCommand({
        args: { dir: { type: 'positional', required: false } },
        run({ args }) {
          received.push({ command: name, dir: args.dir })
        },
      })
    const main = defineCommand({
      subCommands: {
        create: command('create'),
        add: command('add'),
      },
    })
    for (const dir of ['constructor', 'valueOf', 'hasOwnProperty']) {
      await runCommand(main, {
        rawArgs: routeArgs([dir, '--yes'], { create: {}, add: {} }),
      })
    }
    expect(received).toEqual([
      { command: 'create', dir: 'constructor' },
      { command: 'create', dir: 'valueOf' },
      { command: 'create', dir: 'hasOwnProperty' },
    ])
  })
})
