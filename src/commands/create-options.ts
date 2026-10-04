import { stat, readdir } from 'node:fs/promises'
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
import { features as registry } from '../features/index.ts'
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

/** What is at the target path, as far as creating a project there goes. */
export type DirState =
  | 'missing'
  | 'empty'
  | 'not-empty'
  | 'not-a-directory'
  | 'parent-not-a-directory'

export interface ResolveDeps {
  /** Omitted for non-interactive runs; every question then takes its default. */
  prompter?: Prompter
  inspectDir(path: string): Promise<DirState>
}

const errorCode = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined

export async function inspectDir(path: string): Promise<DirState> {
  try {
    if (!(await stat(path)).isDirectory()) return 'not-a-directory'
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return 'missing'
    if (errorCode(error) === 'ENOTDIR') return 'parent-not-a-directory'
    throw error
  }
  return (await readdir(path)).length === 0 ? 'empty' : 'not-empty'
}

type MemberBase = Omit<MemberSpec, 'features'>

const KINDS = ['frontend', 'library', 'monorepo'] as const
const FRAMEWORKS = ['vue', 'react'] as const
const PACKAGE_MANAGERS = ['pnpm', 'bun'] as const

const PACKAGE_NAME = /^[a-z0-9][a-z0-9._-]*$/
const SCOPED_PACKAGE_NAME = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/

export const isValidPackageName = (name: string) =>
  PACKAGE_NAME.test(name) || SCOPED_PACKAGE_NAME.test(name)

/** Checks the directory's own name, so `.` is judged by the current directory. */
const directoryNameError = (dir: string) => {
  const name = basename(resolve(dir))
  return PACKAGE_NAME.test(name) ? undefined : `Invalid directory name: ${name}`
}

const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * A custom GitHub Pages domain is a bare hostname such as `www.example.com`,
 * without scheme, path or port. Returns the lowercased hostname, or undefined
 * when the value is not one.
 */
export function normalizePagesDomain(value: string): string | undefined {
  const domain = value.toLowerCase()
  const labels = domain.split('.')
  return domain.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => HOSTNAME_LABEL.test(label))
    ? domain
    : undefined
}

const PAGES_DOMAIN_HINT =
  'Use a bare hostname such as www.example.com (no scheme, path or port)'

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string,
): T | undefined {
  if (value === undefined) return undefined
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new UsageError(`Unknown ${flag} "${value}"; use ${allowed.join(', ')}`)
}

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

  if (args.kind === 'backend') {
    throw new UsageError('backend projects are not supported yet')
  }
  const kind: ProjectKind =
    oneOf(args.kind, KINDS, '--kind') ??
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
  const frameworkFlag = oneOf(args.framework, FRAMEWORKS, '--framework')
  if (kind === 'library' && frameworkFlag) {
    throw new UsageError('--framework does not apply to library projects')
  }
  const packageManagerFlag = oneOf(args.pm, PACKAGE_MANAGERS, '--pm')
  const pagesDomainFlag =
    args.pagesDomain === undefined
      ? undefined
      : normalizePagesDomain(args.pagesDomain)
  if (args.pagesDomain !== undefined && !pagesDomainFlag) {
    throw new UsageError(
      `Invalid --pages-domain "${args.pagesDomain}". ${PAGES_DOMAIN_HINT}`,
    )
  }

  const placeholder = kind === 'library' ? 'my-lib' : 'my-app'
  const dir =
    args.dir ??
    (prompter
      ? await prompter.text('Project directory', {
          placeholder,
          defaultValue: placeholder,
          validate: (value) =>
            !value || !directoryNameError(value)
              ? undefined
              : 'Use lowercase letters, digits, ".", "-" or "_"',
        })
      : placeholder)
  const root = resolve(dir)
  const dirError = directoryNameError(dir)
  if (dirError) throw new UsageError(dirError)
  const dirState = await deps.inspectDir(root)
  if (dirState === 'not-empty') {
    throw new UsageError(`${dir} already exists and is not empty.`)
  }
  if (dirState === 'not-a-directory') {
    throw new UsageError(`${dir} exists and is not a directory.`)
  }
  if (dirState === 'parent-not-a-directory') {
    throw new UsageError(
      `Cannot create ${dir}: a parent path is not a directory.`,
    )
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
  if (kind !== 'monorepo' && args.members !== undefined) {
    throw new UsageError('--members only applies to monorepo projects')
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
    parseFeatures(args.features) ??
    (preset ? presetFor(preset) : undefined) ??
    (prompter
      ? await promptFeatures(prompter, presetFor(defaults), candidates)
      : presetFor(defaults))

  const usesPages = kind === 'frontend' && features.includes('github-pages')
  if (pagesDomainFlag && !usesPages) {
    throw new UsageError(
      '--pages-domain only applies to frontend projects with github-pages',
    )
  }
  const pagesDomain =
    pagesDomainFlag ??
    (prompter && usesPages ? await askPagesDomain(prompter) : undefined)

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

async function askPagesDomain(prompter: Prompter) {
  const answer = await prompter.text(
    'Custom domain for GitHub Pages (leave empty to use <user>.github.io/<repo>)',
    {
      defaultValue: '',
      validate: (value) =>
        !value || normalizePagesDomain(value) ? undefined : PAGES_DOMAIN_HINT,
    },
  )
  if (!answer) return undefined
  const domain = normalizePagesDomain(answer)
  if (!domain) {
    throw new UsageError(
      `Invalid custom domain "${answer}". ${PAGES_DOMAIN_HINT}`,
    )
  }
  return domain
}

function parseFeatures(value: string | undefined) {
  const items = parseList(value)
  if (!items) return undefined
  const known = new Set<string>(registry.map((feature) => feature.id))
  const unknown = items.filter((item) => !known.has(item))
  if (unknown.length > 0) {
    throw new UsageError(`Unknown features: ${unknown.join(', ')}`)
  }
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
