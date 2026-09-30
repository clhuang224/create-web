import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import * as p from '@clack/prompts'
import { defineCommand } from 'citty'
import { MANIFEST_PATH, readManifest } from '../core/manifest.ts'
import { PackageJsonEditor } from '../core/package-json.ts'
import { ResolveError } from '../core/resolver.ts'
import type { FeatureId, Framework } from '../core/types.ts'
import { VirtualFs } from '../core/vfs.ts'
import {
  generateMember,
  type MemberSpec,
  memberCandidates,
  memberPath,
  recordMember,
} from '../core/workspace.ts'
import { presetFeatures, presets } from '../presets.ts'
import { clackPrompter } from './prompter.ts'
import { formatTouchedProjects } from './project-format.ts'
import { promptFeatures } from './prompts.ts'
import { exitIfCancelled, parseList, runProcess, showNotes } from './shared.ts'

const MEMBER_NAME = /^[a-z0-9][a-z0-9._-]*$/
type MemberType = 'vue' | 'react' | 'library'

export const addMemberCommand = defineCommand({
  meta: {
    name: 'add-member',
    description:
      'Add an app or package to the monorepo in the current directory',
  },
  args: {
    name: {
      type: 'positional',
      required: true,
      description: 'Project name, e.g. admin → apps/admin or packages/admin',
    },
    type: { type: 'string', description: 'vue, react or library' },
    features: { type: 'string', description: 'Comma-separated feature ids' },
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'Skip prompts; features follow the lynn preset',
    },
    install: {
      type: 'boolean',
      default: true,
      description: 'Install dependencies afterwards',
    },
  },
  async run({ args }) {
    p.intro('create-web add-member')
    const root = process.cwd()
    const disk = new VirtualFs(root)
    const manifest = await readManifest(disk)
    if (manifest?.kind !== 'monorepo') {
      return fail(
        `Run this at the root of a monorepo created by create-web (no monorepo ${MANIFEST_PATH} here).`,
      )
    }
    if (!MEMBER_NAME.test(args.name)) {
      return fail(`Invalid project name: ${args.name}`)
    }
    const interactive = !args.yes && process.stdin.isTTY

    const type = (args.type ??
      (interactive
        ? exitIfCancelled(
            await p.select<MemberType>({
              message: 'Project type',
              options: [
                { value: 'vue', label: 'Vue app' },
                { value: 'react', label: 'React app' },
                { value: 'library', label: 'Library' },
              ],
            }),
          )
        : undefined)) as MemberType | undefined
    if (type !== 'vue' && type !== 'react' && type !== 'library') {
      return fail('Pass --type vue, react or library.')
    }
    const kind = type === 'library' ? 'library' : 'frontend'
    const framework: Framework | undefined =
      type === 'library' ? undefined : type

    const target = memberPath({ name: args.name, kind })
    if (!(await isEmptyDir(join(root, target)))) {
      return fail(`${target} already exists and is not empty.`)
    }

    const candidates = memberCandidates(kind, framework)
    const initial = presetFeatures(presets.lynn, kind, framework).filter((id) =>
      candidates.some((feature) => feature.id === id),
    )
    const features =
      (parseList(args.features) as FeatureId[] | undefined) ??
      (interactive
        ? await promptFeatures(clackPrompter, initial, candidates)
        : initial)

    const { name: rootName = 'workspace' } = (
      await PackageJsonEditor.load(disk)
    ).data
    const member: MemberSpec = { name: args.name, kind, framework, features }
    let result
    try {
      result = await generateMember(
        root,
        {
          name: rootName,
          packageManager: manifest.packageManager,
          features: manifest.features,
        },
        member,
      )
    } catch (error) {
      if (error instanceof ResolveError) return fail(error.message)
      throw error
    }
    await result.fs.commit()
    const rootFs = await recordMember(root, target)
    await rootFs.commit()
    p.log.success(
      `Created ${result.fs.changedPaths().length} files in ${target}`,
    )

    if (args.install) {
      p.log.step(`Running ${manifest.packageManager} install`)
      if (
        (await runProcess(manifest.packageManager, ['install'], root)) !== 0
      ) {
        p.log.warn(
          `${manifest.packageManager} install failed; run it manually.`,
        )
      } else {
        await formatTouchedProjects(root, [
          { dir: target, fs: result.fs },
          { dir: '', fs: rootFs },
        ])
      }
    }
    showNotes(result.notes.map((note) => `${target}: ${note}`))
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
