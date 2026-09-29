import { readdir } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import * as p from '@clack/prompts'
import { defineCommand } from 'citty'
import { generate } from '../core/generate.ts'
import { ResolveError } from '../core/resolver.ts'
import {
  generateWorkspace,
  type MemberSpec,
  splitWorkspaceFeatures,
  type WorkspaceResult,
  workspacePresetFeatures,
} from '../core/workspace.ts'
import type {
  FeatureId,
  Framework,
  PackageManager,
  ProjectKind,
  ProjectOptions,
} from '../core/types.ts'
import {
  compatibleFeatures,
  type Preset,
  type PresetName,
  presetFeatures,
  presets,
} from '../presets.ts'
import { promptFeatures } from './prompts.ts'
import { exitIfCancelled, parseList, runProcess, showNotes } from './shared.ts'

const PACKAGE_NAME = /^[a-z0-9][a-z0-9._-]*$/
const SCOPED_PACKAGE_NAME = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/

const isValidPackageName = (name: string) =>
  PACKAGE_NAME.test(name) || SCOPED_PACKAGE_NAME.test(name)

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

    const preset =
      args.preset === undefined ? undefined : presets[args.preset as PresetName]
    if (args.preset !== undefined && !preset)
      return fail(`Unknown preset: ${args.preset}`)
    const interactive = !args.yes && !preset && process.stdin.isTTY
    const defaults = preset ?? presets.lynn

    const kind = (args.kind ??
      (interactive
        ? exitIfCancelled(
            await p.select<ProjectKind>({
              message: 'Project kind',
              options: [
                { value: 'frontend', label: 'Frontend', hint: 'Vite SPA' },
                { value: 'library', label: 'Library', hint: 'npm package' },
                {
                  value: 'backend',
                  label: 'Backend',
                  hint: 'coming soon',
                  disabled: true,
                },
                {
                  value: 'monorepo',
                  label: 'Monorepo',
                  hint: 'apps/* and packages/*',
                },
              ],
            }),
          )
        : 'frontend')) as ProjectKind
    if (kind === 'library' && args.framework !== undefined) {
      return fail('--framework does not apply to library projects')
    }

    const placeholder = kind === 'library' ? 'my-lib' : 'my-app'
    const dir =
      args.dir ??
      (interactive
        ? exitIfCancelled(
            await p.text({
              message: 'Project directory',
              placeholder,
              defaultValue: placeholder,
              validate: (value) =>
                !value || PACKAGE_NAME.test(basename(value))
                  ? undefined
                  : 'Use lowercase letters, digits, ".", "-" or "_"',
            }),
          )
        : placeholder)
    const root = resolve(dir)
    if (!PACKAGE_NAME.test(basename(root)))
      return fail(`Invalid directory name: ${basename(root)}`)
    if (!(await isEmptyDir(root)))
      return fail(`${dir} already exists and is not empty.`)

    // Libraries are often scoped (@scope/name), so their package name can differ from the directory.
    const name =
      args.name ??
      (interactive && kind === 'library'
        ? exitIfCancelled(
            await p.text({
              message: 'Package name',
              placeholder: basename(root),
              defaultValue: basename(root),
              validate: (value) =>
                !value || isValidPackageName(value)
                  ? undefined
                  : 'Use a valid npm package name, optionally scoped',
            }),
          )
        : basename(root))
    if (!isValidPackageName(name)) return fail(`Invalid package name: ${name}`)

    const promptFramework = async () =>
      (args.framework ??
        preset?.framework ??
        (interactive
          ? exitIfCancelled(
              await p.select<Framework>({
                message: 'Framework',
                options: [
                  { value: 'vue', label: 'Vue' },
                  { value: 'react', label: 'React' },
                ],
              }),
            )
          : defaults.framework)) as Framework
    const framework = kind === 'frontend' ? await promptFramework() : undefined

    const packageManager = (args.pm ??
      preset?.packageManager ??
      (interactive
        ? exitIfCancelled(
            await p.select<PackageManager>({
              message: 'Package manager',
              options: [
                { value: 'pnpm', label: 'pnpm' },
                { value: 'bun', label: 'bun' },
              ],
            }),
          )
        : defaults.packageManager)) as PackageManager

    let members: Omit<MemberSpec, 'features'>[] = []
    if (kind === 'monorepo') {
      const parsed = parseMembers(args.members)
      if (parsed instanceof Error) return fail(parsed.message)
      members = parsed ?? (await promptMembers(interactive, promptFramework))
    }

    const presetFor = (source: Preset) =>
      kind === 'monorepo'
        ? workspacePresetFeatures(source, members)
        : presetFeatures(source, kind, framework)
    const candidates =
      kind === 'monorepo'
        ? [
            ...new Set([
              ...compatibleFeatures('monorepo'),
              ...members.flatMap((member) =>
                compatibleFeatures(member.kind, member.framework),
              ),
            ]),
          ].filter((feature) => !feature.standaloneOnly)
        : compatibleFeatures(kind, framework)

    const features =
      (parseList(args.features) as FeatureId[] | undefined) ??
      (preset ? presetFor(preset) : undefined) ??
      (interactive
        ? await promptFeatures(presetFor(defaults), candidates)
        : presetFor(defaults))

    let pagesDomain = args['pages-domain']
    if (
      pagesDomain === undefined &&
      interactive &&
      features.includes('github-pages')
    ) {
      pagesDomain =
        exitIfCancelled(
          await p.text({
            message:
              'Custom domain for GitHub Pages (leave empty to use <user>.github.io/<repo>)',
            defaultValue: '',
          }),
        ) || undefined
    }

    const options: ProjectOptions = {
      name,
      kind,
      framework,
      packageManager,
      features,
      pagesDomain,
    }
    let projects: WorkspaceResult['projects']
    try {
      if (kind === 'monorepo') {
        const split = splitWorkspaceFeatures(features, members)
        projects = (
          await generateWorkspace({
            root,
            options: { ...options, features: split.root },
            members: split.members,
          })
        ).projects
      } else {
        projects = [
          {
            path: '',
            result: await generate({ root, mode: 'create', options }),
          },
        ]
      }
    } catch (error) {
      if (error instanceof ResolveError) return fail(error.message)
      throw error
    }
    let fileCount = 0
    for (const { result } of projects) {
      await result.fs.commit()
      fileCount += result.fs.changedPaths().length
    }
    p.log.success(`Created ${fileCount} files in ${dir}`)

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

const MEMBER_NAME = /^[a-z0-9][a-z0-9._-]*$/

/** Parses `web:vue,shared:library`; undefined when the flag is absent. */
function parseMembers(value: string | undefined) {
  const items = parseList(value)
  if (!items) return undefined
  const members: Omit<MemberSpec, 'features'>[] = []
  for (const item of items) {
    const [memberName = '', type = ''] = item.split(':')
    if (!MEMBER_NAME.test(memberName)) {
      return new Error(`Invalid project name in --members: ${memberName}`)
    }
    if (type === 'library') {
      members.push({ name: memberName, kind: 'library' })
    } else if (type === 'vue' || type === 'react') {
      members.push({ name: memberName, kind: 'frontend', framework: type })
    } else {
      return new Error(
        `Unknown project type "${type}" in --members; use vue, react or library`,
      )
    }
  }
  return members
}

async function promptMembers(
  interactive: boolean,
  promptFramework: () => Promise<Framework>,
): Promise<Omit<MemberSpec, 'features'>[]> {
  const selected = interactive
    ? exitIfCancelled(
        await p.multiselect({
          message: 'Initial projects',
          options: [
            { value: 'web', label: 'apps/web', hint: 'frontend app' },
            { value: 'shared', label: 'packages/shared', hint: 'library' },
          ],
          initialValues: ['web', 'shared'],
          required: false,
        }),
      )
    : ['web', 'shared']
  const members: Omit<MemberSpec, 'features'>[] = []
  if (selected.includes('web')) {
    members.push({
      name: 'web',
      kind: 'frontend',
      framework: await promptFramework(),
    })
  }
  if (selected.includes('shared')) {
    members.push({ name: 'shared', kind: 'library' })
  }
  return members
}
