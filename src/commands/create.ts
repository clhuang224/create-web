import { readdir } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import * as p from '@clack/prompts'
import { defineCommand } from 'citty'
import { generate } from '../core/generate.ts'
import { ResolveError } from '../core/resolver.ts'
import type { FeatureId, Framework, PackageManager } from '../core/types.ts'
import { features as registry } from '../features/index.ts'
import { type PresetName, presetFeatures, presets } from '../presets.ts'
import { exitIfCancelled, parseList, runProcess, showNotes } from './shared.ts'

const PACKAGE_NAME = /^[a-z0-9][a-z0-9._-]*$/

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
    framework: { type: 'string', description: 'vue' },
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

    const dir =
      args.dir ??
      (interactive
        ? exitIfCancelled(
            await p.text({
              message: 'Project directory',
              placeholder: 'my-app',
              defaultValue: 'my-app',
              validate: (value) =>
                !value || PACKAGE_NAME.test(basename(value))
                  ? undefined
                  : 'Use lowercase letters, digits, ".", "-" or "_"',
            }),
          )
        : 'my-app')
    const root = resolve(dir)
    const name = basename(root)
    if (!PACKAGE_NAME.test(name)) return fail(`Invalid package name: ${name}`)
    if (!(await isEmptyDir(root)))
      return fail(`${dir} already exists and is not empty.`)

    const framework = (args.framework ??
      preset?.framework ??
      (interactive
        ? exitIfCancelled(
            await p.select<Framework>({
              message: 'Framework',
              options: [
                { value: 'vue', label: 'Vue' },
                {
                  value: 'react',
                  label: 'React',
                  hint: 'coming soon',
                  disabled: true,
                },
              ],
            }),
          )
        : defaults.framework)) as Framework

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

    const features = (parseList(args.features) ??
      (preset ? presetFeatures(preset, framework) : undefined) ??
      (interactive
        ? exitIfCancelled(
            await p.multiselect<FeatureId>({
              message: 'Features',
              options: registry
                .filter(
                  (feature) =>
                    !feature.frameworks ||
                    feature.frameworks.includes(framework),
                )
                .map((feature) => ({
                  value: feature.id,
                  label: feature.label,
                  hint: feature.hint,
                })),
              initialValues: presetFeatures(defaults, framework),
              required: false,
            }),
          )
        : presetFeatures(defaults, framework))) as FeatureId[]

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
          kind: 'frontend',
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
