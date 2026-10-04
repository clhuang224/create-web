#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import pkg from '../package.json' with { type: 'json' }
import { addMemberCommand } from './commands/add-member.ts'
import { addCommand } from './commands/add.ts'
import { createCommand } from './commands/create.ts'
import { removeCommand } from './commands/remove.ts'
import { routeArgs } from './commands/route.ts'

const subCommands = {
  create: createCommand,
  add: addCommand,
  remove: removeCommand,
  'add-member': addMemberCommand,
}

const main = defineCommand({
  meta: {
    name: 'create-web',
    version: pkg.version,
    description: pkg.description,
  },
  subCommands,
})

void runMain(main, { rawArgs: routeArgs(process.argv.slice(2), subCommands) })
