#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import pkg from '../package.json' with { type: 'json' }

const notImplemented = (name: string) =>
  defineCommand({
    meta: { name, description: `${name} (not implemented yet)` },
    run() {
      console.error(`\`${name}\` is not implemented yet.`)
      process.exitCode = 1
    },
  })

const main = defineCommand({
  meta: {
    name: 'create-web',
    version: pkg.version,
    description: pkg.description,
  },
  subCommands: {
    create: notImplemented('create'),
    add: notImplemented('add'),
  },
})

void runMain(main)
