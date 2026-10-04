import * as p from '@clack/prompts'
import { defineCommand } from 'citty'
import { generate } from '../core/generate.ts'
import { MANIFEST_PATH, readManifest } from '../core/manifest.ts'
import { PackageJsonEditor } from '../core/package-json.ts'
import { ResolveError } from '../core/resolver.ts'
import type { FeatureId } from '../core/types.ts'
import { VirtualFs } from '../core/vfs.ts'
import { memberWorkspace, syncMembers } from '../core/workspace.ts'
import { features as registry } from '../features/index.ts'
import { clackPrompter } from './prompter.ts'
import { formatterLocation, formatTouchedProjects } from './project-format.ts'
import {
  changedFileList,
  exitIfCancelled,
  projectNotes,
  showNotes,
  installDependencies,
} from './shared.ts'

export const removeCommand = defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove features from the project in the current directory',
  },
  args: {
    features: {
      type: 'positional',
      required: false,
      description: 'Feature ids to remove',
    },
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'Apply without confirmation',
    },
    install: {
      type: 'boolean',
      default: true,
      description: 'Install dependencies afterwards to prune removed ones',
    },
  },
  async run({ args }) {
    p.intro('create-web remove')
    const root = process.cwd()
    const disk = new VirtualFs(root)

    const manifest = await readManifest(disk)
    if (!manifest) {
      return fail(
        `No ${MANIFEST_PATH} found. \`remove\` supports projects created by create-web only.`,
      )
    }
    const { name = 'app' } = (await PackageJsonEditor.load(disk)).data

    let requested = args._.map(String) as FeatureId[]
    if (requested.length === 0) {
      const removable = registry.filter(
        (feature) => feature.remove && manifest.features.includes(feature.id),
      )
      if (removable.length === 0) return done('Nothing can be removed.')
      if (!process.stdin.isTTY) return fail('Pass the feature ids to remove.')
      requested = await clackPrompter.multiselect<FeatureId>(
        'Features to remove',
        removable.map((feature) => ({
          value: feature.id,
          label: feature.label,
          hint: feature.hint,
        })),
        [],
      )
      if (requested.length === 0) return done('Nothing removed.')
    }

    let result
    let members
    try {
      result = await generate({
        root,
        mode: 'remove',
        options: {
          name,
          kind: manifest.kind,
          framework: manifest.framework,
          packageManager: manifest.packageManager,
          features: [],
          pagesDomain: manifest.pagesDomain,
        },
        existing: manifest.features,
        workspace: await memberWorkspace(root, manifest),
        remove: requested,
      })
      // Members derive files from the root's features (e.g. ESLint's
      // skipFormatting), so they follow the change.
      members =
        manifest.kind === 'monorepo'
          ? await syncMembers(root, manifest.members ?? [], result.features)
          : []
    } catch (error) {
      if (error instanceof ResolveError) return fail(error.message)
      throw error
    }

    const projects = [{ path: '', result }, ...members]
    p.note(changedFileList(projects), `Removing ${result.removed.join(', ')}`)
    if (!args.yes && process.stdin.isTTY) {
      const confirmed = exitIfCancelled(
        await p.confirm({ message: 'Apply these changes?' }),
      )
      if (!confirmed) return done('No changes written.')
    }
    for (const project of projects) await project.result.fs.commit()

    if (args.install) {
      p.log.step(`Running ${manifest.packageManager} install`)
      if ((await installDependencies(manifest.packageManager, root)) !== 0) {
        p.log.warn(
          `${manifest.packageManager} install failed; run it manually.`,
        )
      } else {
        const location = await formatterLocation(root, manifest)
        await formatTouchedProjects(location.root, [
          { dir: location.dir, fs: result.fs },
          ...members.map(({ path, result: member }) => ({
            dir: path,
            fs: member.fs,
          })),
        ])
      }
    }
    showNotes(projectNotes(projects))
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
