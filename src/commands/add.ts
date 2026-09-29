import * as p from '@clack/prompts'
import { defineCommand } from 'citty'
import { generate } from '../core/generate.ts'
import { MANIFEST_PATH, readManifest } from '../core/manifest.ts'
import { PackageJsonEditor } from '../core/package-json.ts'
import { ResolveError } from '../core/resolver.ts'
import type { FeatureId } from '../core/types.ts'
import { VirtualFs } from '../core/vfs.ts'
import { compatibleFeatures } from '../presets.ts'
import { exitIfCancelled, runProcess, showNotes } from './shared.ts'

export const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Add features to the project in the current directory',
  },
  args: {
    features: {
      type: 'positional',
      required: false,
      description: 'Feature ids to add',
    },
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'Apply without confirmation',
    },
    install: {
      type: 'boolean',
      default: true,
      description: 'Install dependencies afterwards',
    },
  },
  async run({ args }) {
    p.intro('create-web add')
    const root = process.cwd()
    const disk = new VirtualFs(root)

    const manifest = await readManifest(disk)
    if (!manifest) {
      return fail(
        `No ${MANIFEST_PATH} found. \`add\` currently supports projects created by create-web only.`,
      )
    }
    const { name = 'app' } = (await PackageJsonEditor.load(disk)).data

    let requested = args._.map(String) as FeatureId[]
    if (requested.length === 0) {
      const available = compatibleFeatures(
        manifest.kind,
        manifest.framework,
      ).filter((feature) => !manifest.features.includes(feature.id))
      if (available.length === 0)
        return done('Every available feature is already applied.')
      if (!process.stdin.isTTY) return fail('Pass the feature ids to add.')
      requested = exitIfCancelled(
        await p.multiselect<FeatureId>({
          message: 'Features to add',
          options: available.map((feature) => ({
            value: feature.id,
            label: feature.label,
            hint: feature.hint,
          })),
        }),
      )
    }

    let result
    try {
      result = await generate({
        root,
        mode: 'add',
        options: { ...manifest, name, features: requested },
        existing: manifest.features,
      })
    } catch (error) {
      if (error instanceof ResolveError) return fail(error.message)
      throw error
    }
    if (result.applied.length === 0)
      return done('Nothing to add; those features are already applied.')

    p.note(
      result.fs.changedPaths().join('\n'),
      `Adding ${result.applied.join(', ')}`,
    )
    if (!args.yes && process.stdin.isTTY) {
      const confirmed = exitIfCancelled(
        await p.confirm({ message: 'Write these changes?' }),
      )
      if (!confirmed) return done('No changes written.')
    }
    await result.fs.commit()

    if (args.install) {
      p.log.step(`Running ${manifest.packageManager} install`)
      if (
        (await runProcess(manifest.packageManager, ['install'], root)) !== 0
      ) {
        p.log.warn(
          `${manifest.packageManager} install failed; run it manually.`,
        )
      }
    }
    showNotes(result.notes)
    p.outro('Done.')
  },
})

function fail(message: string) {
  p.cancel(message)
  process.exitCode = 1
}

function done(message: string) {
  p.outro(message)
}
