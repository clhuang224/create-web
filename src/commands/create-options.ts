import { basename, resolve } from 'node:path'
import type {
  FeatureId,
  Framework,
  PackageManager,
  ProjectKind,
  ProjectOptions,
} from '../core/types.ts'
import {
  type MemberSpec,
  splitWorkspaceFeatures,
  workspacePresetFeatures,
} from '../core/workspace.ts'
import {
  compatibleFeatures,
  type Preset,
  presetFeatures,
  presets,
} from '../presets.ts'
import type { Prompter } from './prompter.ts'
import { promptFeatures } from './prompts.ts'
import { parseList } from './shared.ts'

/** Invalid input from flags or answers; shown to the user as is. */
export class UsageError extends Error {}

export interface CreateArgs {
  dir?: string
  preset?: string
  kind?: string
  name?: string
  framework?: string
  pm?: string
  features?: string
  members?: string
  pagesDomain?: string
  yes?: boolean
}

export type CreatePlan =
  | { type: 'project'; root: string; dir: string; options: ProjectOptions }
  | {
      type: 'workspace'
      root: string
      dir: string
      options: ProjectOptions
      members: MemberSpec[]
    }

export interface ResolveDeps {
  /** Omitted for non-interactive runs; every question then takes its default. */
  prompter?: Prompter
  isEmptyDir(path: string): Promise<boolean>
}

type MemberBase = Omit<MemberSpec, 'features'>

const PACKAGE_NAME = /^[a-z0-9][a-z0-9._-]*$/
const SCOPED_PACKAGE_NAME = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/

export const isValidPackageName = (name: string) =>
  PACKAGE_NAME.test(name) || SCOPED_PACKAGE_NAME.test(name)

/**
 * Turns flags (and, when a prompter is given, answers) into what to generate.
 * Flags always win; prompts only fill in what flags left open.
 */
export async function resolveCreatePlan(
  args: CreateArgs,
  deps: ResolveDeps,
): Promise<CreatePlan> {
  const preset =
    args.preset === undefined
      ? undefined
      : (presets as Record<string, Preset>)[args.preset]
  if (args.preset !== undefined && !preset) {
    throw new UsageError(`Unknown preset: ${args.preset}`)
  }
  // A preset or --yes answers everything, so there is nothing to ask.
  const prompter = args.yes || preset ? undefined : deps.prompter
  const defaults: Preset = preset ?? presets.lynn

  const kind: ProjectKind =
    (args.kind as ProjectKind | undefined) ??
    (prompter
      ? await prompter.select<ProjectKind>('Project kind', [
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
        ])
      : 'frontend')
  const frameworkFlag = args.framework as Framework | undefined
  if (kind === 'library' && frameworkFlag) {
    throw new UsageError('--framework does not apply to library projects')
  }
  const packageManagerFlag = args.pm as PackageManager | undefined

  const placeholder = kind === 'library' ? 'my-lib' : 'my-app'
  const dir =
    args.dir ??
    (prompter
      ? await prompter.text('Project directory', {
          placeholder,
          defaultValue: placeholder,
          validate: (value) =>
            !value || PACKAGE_NAME.test(basename(value))
              ? undefined
              : 'Use lowercase letters, digits, ".", "-" or "_"',
        })
      : placeholder)
  const root = resolve(dir)
  if (!PACKAGE_NAME.test(basename(root))) {
    throw new UsageError(`Invalid directory name: ${basename(root)}`)
  }
  if (!(await deps.isEmptyDir(root))) {
    throw new UsageError(`${dir} already exists and is not empty.`)
  }

  // Libraries are often scoped (@scope/name), so their package name can differ from the directory.
  const name =
    args.name ??
    (prompter && kind === 'library'
      ? await prompter.text('Package name', {
          placeholder: basename(root),
          defaultValue: basename(root),
          validate: (value) =>
            !value || isValidPackageName(value)
              ? undefined
              : 'Use a valid npm package name, optionally scoped',
        })
      : basename(root))
  if (!isValidPackageName(name)) {
    throw new UsageError(`Invalid package name: ${name}`)
  }

  const askFramework = async (): Promise<Framework> =>
    frameworkFlag ??
    preset?.framework ??
    (prompter
      ? await prompter.select<Framework>('Framework', [
          { value: 'vue', label: 'Vue' },
          { value: 'react', label: 'React' },
        ])
      : defaults.framework)
  const framework = kind === 'frontend' ? await askFramework() : undefined

  const packageManager: PackageManager =
    packageManagerFlag ??
    preset?.packageManager ??
    (prompter
      ? await prompter.select<PackageManager>('Package manager', [
          { value: 'pnpm', label: 'pnpm' },
          { value: 'bun', label: 'bun' },
        ])
      : defaults.packageManager)

  const members: MemberBase[] =
    kind === 'monorepo'
      ? (parseMembers(args.members) ??
        (await askMembers(prompter, askFramework)))
      : []

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
    parseFeatures(args.features) ??
    (preset ? presetFor(preset) : undefined) ??
    (prompter
      ? await promptFeatures(prompter, presetFor(defaults), candidates)
      : presetFor(defaults))

  const pagesDomain =
    args.pagesDomain ??
    (prompter && features.includes('github-pages')
      ? (await prompter.text(
          'Custom domain for GitHub Pages (leave empty to use <user>.github.io/<repo>)',
          { defaultValue: '' },
        )) || undefined
      : undefined)

  const options: ProjectOptions = {
    name,
    kind,
    framework,
    packageManager,
    features,
    pagesDomain,
  }
  if (kind !== 'monorepo') return { type: 'project', root, dir, options }

  const split = splitWorkspaceFeatures(features, members)
  return {
    type: 'workspace',
    root,
    dir,
    options: { ...options, features: split.root },
    members: split.members,
  }
}

function parseFeatures(value: string | undefined) {
  const items = parseList(value)
  if (!items) return undefined
  return items as FeatureId[]
}

const MEMBER_NAME = /^[a-z0-9][a-z0-9._-]*$/

/** Parses `web:vue,shared:library`; undefined when the flag is absent. */
export function parseMembers(value: string | undefined) {
  const items = parseList(value)
  if (!items) return undefined
  const members: MemberBase[] = []
  for (const item of items) {
    const [memberName = '', type = ''] = item.split(':')
    if (!MEMBER_NAME.test(memberName)) {
      throw new UsageError(`Invalid project name in --members: ${memberName}`)
    }
    if (type === 'library') {
      members.push({ name: memberName, kind: 'library' })
    } else if (type === 'vue' || type === 'react') {
      members.push({ name: memberName, kind: 'frontend', framework: type })
    } else {
      throw new UsageError(
        `Unknown project type "${type}" in --members; use vue, react or library`,
      )
    }
  }
  return members
}

async function askMembers(
  prompter: Prompter | undefined,
  askFramework: () => Promise<Framework>,
): Promise<MemberBase[]> {
  const selected = prompter
    ? await prompter.multiselect(
        'Initial projects',
        [
          { value: 'web', label: 'apps/web', hint: 'frontend app' },
          { value: 'shared', label: 'packages/shared', hint: 'library' },
        ],
        ['web', 'shared'],
      )
    : ['web', 'shared']
  const members: MemberBase[] = []
  if (selected.includes('web')) {
    members.push({
      name: 'web',
      kind: 'frontend',
      framework: await askFramework(),
    })
  }
  if (selected.includes('shared')) {
    members.push({ name: 'shared', kind: 'library' })
  }
  return members
}
