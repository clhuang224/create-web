#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import pkg from '../package.json' with { type: 'json' }
import { addCommand } from './commands/add.ts'
import { createCommand } from './commands/create.ts'

const subCommands = { create: createCommand, add: addCommand }

const main = defineCommand({
  meta: {
    name: 'create-web',
    version: pkg.version,
    description: pkg.description,
  },
  subCommands,
})

// `pnpm create @clhuang224/web my-app` runs `create-web my-app`, so anything that is
// not a subcommand or a top-level flag is treated as arguments to `create`.
const [first] = process.argv.slice(2)
const topLevelFlags = ['--help', '-h', '--version', '-v']
const rawArgs =
  first !== undefined && (first in subCommands || topLevelFlags.includes(first))
    ? process.argv.slice(2)
    : ['create', ...process.argv.slice(2)]

void runMain(main, { rawArgs })
