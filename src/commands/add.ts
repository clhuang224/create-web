import * as p from '@clack/prompts'
import { defineCommand } from 'citty'
import { generate } from '../core/generate.ts'
import { MANIFEST_PATH, readManifest } from '../core/manifest.ts'
import { PackageJsonEditor } from '../core/package-json.ts'
import { ResolveError } from '../core/resolver.ts'
import type { FeatureId } from '../core/types.ts'
import { VirtualFs } from '../core/vfs.ts'
import {
  memberCandidates,
  memberWorkspace,
  syncMembers,
} from '../core/workspace.ts'
import { features as registry } from '../features/index.ts'
import { compatibleFeatures } from '../presets.ts'
import { clackPrompter } from './prompter.ts'
import { formatterLocation, formatTouchedProjects } from './project-format.ts'
import {
  changedFileList,
  exitIfCancelled,
  projectNotes,
  showNotes,
  installDependencies,
} from './shared.ts'

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
    const workspace = await memberWorkspace(root, manifest)

    let requested = args._.map(String) as FeatureId[]
    if (requested.length === 0) {
      // Inside a monorepo member, root-owned features are added at the root instead.
      const candidates =
        workspace &&
        (manifest.kind === 'frontend' || manifest.kind === 'library')
          ? memberCandidates(manifest.kind, manifest.framework)
          : compatibleFeatures(manifest.kind, manifest.framework)
      const present = new Set([
        ...manifest.features,
        ...(workspace?.rootFeatures ?? []),
      ])
      // Conflicts are checked both ways, since only one side may declare them.
      const excluded = new Set(
        registry.flatMap((feature) =>
          present.has(feature.id) ? (feature.conflicts ?? []) : [],
        ),
      )
      const available = candidates.filter(
        (feature) =>
          !present.has(feature.id) &&
          !excluded.has(feature.id) &&
          !feature.conflicts?.some((id) => present.has(id)),
      )
      if (available.length === 0)
        return done('Every available feature is already applied.')
      if (!process.stdin.isTTY) return fail('Pass the feature ids to add.')
      requested = await clackPrompter.multiselect<FeatureId>(
        'Features to add',
        available.map((feature) => ({
          value: feature.id,
          label: feature.label,
          hint: feature.hint,
        })),
        [],
      )
      if (requested.length === 0) return done('Nothing added.')
    }

    let result
    let members
    try {
      result = await generate({
        root,
        mode: 'add',
        options: {
          name,
          kind: manifest.kind,
          framework: manifest.framework,
          packageManager: manifest.packageManager,
          features: requested,
          pagesDomain: manifest.pagesDomain,
        },
        existing: manifest.features,
        workspace,
      })
      // Members derive files from the root's features (e.g. ESLint's
      // skipFormatting), so they follow the change.
      members =
        manifest.kind === 'monorepo' && result.applied.length > 0
          ? await syncMembers(root, manifest.members ?? [], result.features)
          : []
    } catch (error) {
      if (error instanceof ResolveError) return fail(error.message)
      throw error
    }
    if (result.applied.length === 0)
      return done('Nothing to add; those features are already applied.')

    const projects = [{ path: '', result }, ...members]
    p.note(changedFileList(projects), `Adding ${result.applied.join(', ')}`)
    if (!args.yes && process.stdin.isTTY) {
      const confirmed = exitIfCancelled(
        await p.confirm({ message: 'Write these changes?' }),
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
