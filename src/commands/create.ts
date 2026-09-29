import { readdir } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import * as p from '@clack/prompts'
import { defineCommand } from 'citty'
import { generate } from '../core/generate.ts'
import { ResolveError } from '../core/resolver.ts'
import type {
  FeatureId,
  Framework,
  PackageManager,
  ProjectKind,
} from '../core/types.ts'
import {
  compatibleFeatures,
  type PresetName,
  presetFeatures,
  presets,
} from '../presets.ts'
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
    kind: { type: 'string', description: 'Project kind: frontend or library' },
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
                  hint: 'coming soon',
                  disabled: true,
                },
              ],
            }),
          )
        : 'frontend')) as ProjectKind
    if (kind !== 'frontend' && args.framework !== undefined) {
      return fail('--framework only applies to frontend projects')
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

    const framework =
      kind === 'frontend'
        ? ((args.framework ??
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
              : defaults.framework)) as Framework)
        : undefined

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

    const features =
      (parseList(args.features) as FeatureId[] | undefined) ??
      (preset ? presetFeatures(preset, kind, framework) : undefined) ??
      (interactive
        ? await promptFeatures(
            presetFeatures(defaults, kind, framework),
            kind,
            framework,
          )
        : presetFeatures(defaults, kind, framework))

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

    let result
    try {
      result = await generate({
        root,
        mode: 'create',
        options: {
          name,
          kind,
          framework,
          packageManager,
          features,
          pagesDomain,
        },
      })
    } catch (error) {
      if (error instanceof ResolveError) return fail(error.message)
      throw error
    }
    await result.fs.commit()
    p.log.success(`Created ${result.fs.changedPaths().length} files in ${dir}`)

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

    showNotes(result.notes)
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

const LINTERS: Record<string, { label: string; ids: FeatureId[] }> = {
  eslint: { label: 'ESLint', ids: ['eslint'] },
  oxlint: { label: 'oxlint', ids: ['oxlint'] },
  both: { label: 'oxlint + ESLint', ids: ['oxlint', 'eslint'] },
  none: { label: 'None', ids: [] },
}

const FORMATTERS: Record<string, { label: string; ids: FeatureId[] }> = {
  prettier: { label: 'Prettier', ids: ['prettier'] },
  oxfmt: { label: 'oxfmt', ids: ['oxfmt'] },
  none: { label: 'None', ids: [] },
}

/** Linter and formatter are single choices; everything else is a checklist. */
async function promptFeatures(
  initial: FeatureId[],
  kind: ProjectKind,
  framework: Framework | undefined,
) {
  const initialChoice = (choices: typeof LINTERS) =>
    Object.entries(choices).find(
      ([, { ids }]) =>
        ids.length > 0 && ids.every((id) => initial.includes(id)),
    )?.[0] ?? 'none'

  const linter = exitIfCancelled(
    await p.select({
      message: 'Linter',
      options: Object.entries(LINTERS).map(([value, { label }]) => ({
        value,
        label,
      })),
      initialValue: initialChoice(
        Object.fromEntries(
          Object.entries(LINTERS).sort(
            ([, a], [, b]) => b.ids.length - a.ids.length,
          ),
        ),
      ),
    }),
  )
  const formatter = exitIfCancelled(
    await p.select({
      message: 'Formatter',
      options: Object.entries(FORMATTERS).map(([value, { label }]) => ({
        value,
        label,
      })),
      initialValue: initialChoice(FORMATTERS),
    }),
  )
  const others = compatibleFeatures(kind, framework).filter(
    (feature) => !feature.category,
  )
  const selected = exitIfCancelled(
    await p.multiselect<FeatureId>({
      message: 'Features',
      options: others.map((feature) => ({
        value: feature.id,
        label: feature.label,
        hint: feature.hint,
      })),
      initialValues: others
        .map((feature) => feature.id)
        .filter((id) => initial.includes(id)),
      required: false,
    }),
  )
  return [
    ...(LINTERS[linter]?.ids ?? []),
    ...(FORMATTERS[formatter]?.ids ?? []),
    ...selected,
  ]
}
