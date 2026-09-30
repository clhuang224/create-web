import { readdir } from 'node:fs/promises'
import { relative } from 'node:path'
import * as p from '@clack/prompts'
import { defineCommand } from 'citty'
import { generate } from '../core/generate.ts'
import { ResolveError } from '../core/resolver.ts'
import { generateWorkspace, type WorkspaceResult } from '../core/workspace.ts'
import { presets } from '../presets.ts'
import {
  type CreatePlan,
  resolveCreatePlan,
  UsageError,
} from './create-options.ts'
import { clackPrompter } from './prompter.ts'
import { formatTouchedProjects } from './project-format.ts'
import { runProcess, showNotes } from './shared.ts'

export const createCommand = defineCommand({
  meta: { name: 'create', description: 'Create a new project' },
  args: {
    dir: {
      type: 'positional',
      required: false,
      description: 'Project directory',
    },
    preset: {
      type: 'string',
      description: `Use a preset (${Object.keys(presets).join(', ')})`,
    },
    kind: {
      type: 'string',
      description: 'Project kind: frontend, library or monorepo',
    },
    name: {
      type: 'string',
      description: 'Package name (defaults to the directory name)',
    },
    framework: {
      type: 'string',
      description: 'Frontend framework: vue or react',
    },
    pm: { type: 'string', description: 'Package manager: pnpm or bun' },
    features: { type: 'string', description: 'Comma-separated feature ids' },
    members: {
      type: 'string',
      description:
        'Monorepo projects as name:vue|react|library, e.g. web:vue,shared:library',
    },
    'pages-domain': {
      type: 'string',
      description: 'Custom domain for GitHub Pages',
    },
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'Skip prompts; unspecified options follow the lynn preset',
    },
    git: {
      type: 'boolean',
      default: true,
      description: 'Initialize a Git repository',
    },
    install: {
      type: 'boolean',
      default: true,
      description: 'Install dependencies',
    },
  },
  async run({ args }) {
    p.intro('create-web')

    let plan: CreatePlan
    let projects: WorkspaceResult['projects']
    try {
      plan = await resolveCreatePlan(
        { ...args, pagesDomain: args['pages-domain'] },
        {
          prompter: process.stdin.isTTY ? clackPrompter : undefined,
          isEmptyDir,
        },
      )
      projects =
        plan.type === 'workspace'
          ? (
              await generateWorkspace({
                root: plan.root,
                options: plan.options,
                members: plan.members,
              })
            ).projects
          : [
              {
                path: '',
                result: await generate({
                  root: plan.root,
                  mode: 'create',
                  options: plan.options,
                }),
              },
            ]
    } catch (error) {
      if (error instanceof UsageError || error instanceof ResolveError) {
        return fail(error.message)
      }
      throw error
    }

    let fileCount = 0
    for (const { result } of projects) {
      await result.fs.commit()
      fileCount += result.fs.changedPaths().length
    }
    p.log.success(`Created ${fileCount} files in ${plan.dir}`)

    const { root } = plan
    const { packageManager } = plan.options
    // Initialize Git before installing so husky's prepare script can set up hooks.
    if (
      args.git &&
      (await runProcess(
        'git',
        ['rev-parse', '--is-inside-work-tree'],
        root,
        true,
      )) !== 0
    ) {
      await runProcess('git', ['init', '--quiet'], root)
    }
    if (args.install) {
      p.log.step(`Running ${packageManager} install`)
      if ((await runProcess(packageManager, ['install'], root)) !== 0) {
        p.log.warn(`${packageManager} install failed; run it manually.`)
      } else {
        await formatTouchedProjects(
          root,
          projects.map(({ path, result }) => ({ dir: path, fs: result.fs })),
        )
      }
    }

    showNotes(
      projects.flatMap(({ path, result }) =>
        result.notes.map((note) => (path ? `${path}: ${note}` : note)),
      ),
    )
    const steps = [`cd ${relative(process.cwd(), root) || '.'}`]
    if (!args.install) steps.push(`${packageManager} install`)
    steps.push(`${packageManager} run dev`)
    p.note(steps.join('\n'), 'Next steps')
    p.outro('Done.')
  },
})

function fail(message: string) {
  p.cancel(message)
  process.exitCode = 1
}

async function isEmptyDir(path: string) {
  try {
    return (await readdir(path)).length === 0
  } catch {
    return true
  }
}
