import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { memberCandidates } from '../core/workspace.ts'
import { features as registry } from '../features/index.ts'
import { presetFeatures, presets } from '../presets.ts'
import {
  type CreateArgs,
  type CreatePlan,
  type DirState,
  inspectDir,
  normalizePagesDomain,
  resolveCreatePlan,
  UsageError,
} from './create-options.ts'
import type { Choice, Prompter } from './prompter.ts'
import { promptFeatures } from './prompts.ts'

type Answer = string | string[]

/**
 * Answers questions by message. Unscripted questions take their default, and
 * every question is recorded so tests can check what was offered.
 */
function scriptedPrompter(answers: Record<string, Answer> = {}) {
  const asked: { message: string; choices?: Choice<string>[] }[] = []
  const prompter: Prompter = {
    async select<T extends string>(
      message: string,
      choices: Choice<T>[],
      initialValue?: T,
    ) {
      asked.push({ message, choices })
      const answer = answers[message]
      const value =
        (answer as T | undefined) ?? initialValue ?? choices[0]?.value
      const choice = choices.find((candidate) => candidate.value === value)
      if (!choice || choice.disabled) {
        throw new Error(`"${String(value)}" is not selectable for ${message}`)
      }
      return choice.value
    },
    async multiselect<T extends string>(
      message: string,
      choices: Choice<T>[],
      initialValues: T[],
    ) {
      asked.push({ message, choices })
      return (answers[message] as T[] | undefined) ?? initialValues
    },
    async text(message, { defaultValue, validate }) {
      asked.push({ message })
      const answer = (answers[message] as string | undefined) ?? defaultValue
      // Like clack, keep asking until the answer passes validation.
      const error = validate?.(answer)
      if (error)
        throw new Error(`"${answer}" rejected for ${message}: ${error}`)
      return answer
    },
  }
  return { prompter, asked }
}

const emptyDir = async (): Promise<DirState> => 'missing'

const plan = (args: CreateArgs, prompter?: Prompter) =>
  resolveCreatePlan(args, { prompter, inspectDir: emptyDir })

const PAGES_QUESTION =
  'Custom domain for GitHub Pages (leave empty to use <user>.github.io/<repo>)'

const projectOptions = (result: CreatePlan) => {
  if (result.type !== 'project') throw new Error('expected a single project')
  return result.options
}

describe('resolveCreatePlan without prompts', () => {
  it('defaults to the lynn preset for a Vue app', async () => {
    const result = await plan({ dir: 'demo' })
    expect(result).toMatchObject({
      type: 'project',
      root: resolve('demo'),
      options: {
        name: 'demo',
        kind: 'frontend',
        framework: 'vue',
        packageManager: 'pnpm',
        features: presetFeatures(presets.lynn, 'frontend', 'vue'),
      },
    })
  })

  it('rejects values outside the supported set', async () => {
    await expect(plan({ dir: 'demo', pm: 'yarn' })).rejects.toThrow(
      'Unknown --pm "yarn"; use pnpm, bun',
    )
    await expect(plan({ dir: 'demo', framework: 'svelte' })).rejects.toThrow(
      'Unknown --framework "svelte"; use vue, react',
    )
    await expect(plan({ dir: 'demo', kind: 'website' })).rejects.toThrow(
      'Unknown --kind "website"',
    )
    await expect(plan({ dir: 'demo', kind: 'backend' })).rejects.toThrow(
      'backend projects are not supported yet',
    )
    await expect(plan({ dir: 'demo', preset: 'nope' })).rejects.toThrow(
      'Unknown preset: nope',
    )
    await expect(
      plan({ dir: 'demo', features: 'eslint,webpack' }),
    ).rejects.toThrow('Unknown features: webpack')
  })

  it('rejects flags that do not fit the project kind', async () => {
    await expect(
      plan({ dir: 'demo', kind: 'library', framework: 'vue' }),
    ).rejects.toThrow('--framework does not apply to library projects')
    await expect(plan({ dir: 'demo', members: 'web:vue' })).rejects.toThrow(
      '--members only applies to monorepo projects',
    )
  })

  it('validates directory and package names', async () => {
    await expect(plan({ dir: 'My App' })).rejects.toBeInstanceOf(UsageError)
    await expect(plan({ dir: 'demo', name: 'Bad Name' })).rejects.toThrow(
      'Invalid package name: Bad Name',
    )
    expect(
      projectOptions(
        await plan({ dir: 'lib', kind: 'library', name: '@scope/lib' }),
      ).name,
    ).toBe('@scope/lib')
  })

  it('refuses a non-empty directory', async () => {
    await expect(
      resolveCreatePlan(
        { dir: 'demo' },
        { inspectDir: async () => 'not-empty' },
      ),
    ).rejects.toThrow('demo already exists and is not empty.')
  })

  it('refuses a target that is not a directory', async () => {
    await expect(
      resolveCreatePlan(
        { dir: 'afile' },
        { inspectDir: async () => 'not-a-directory' },
      ),
    ).rejects.toThrow(new UsageError('afile exists and is not a directory.'))
    await expect(
      resolveCreatePlan(
        { dir: 'afile/app' },
        { inspectDir: async () => 'parent-not-a-directory' },
      ),
    ).rejects.toBeInstanceOf(UsageError)
  })

  it('normalizes --pages-domain to a bare hostname', async () => {
    const options = projectOptions(
      await plan({ dir: 'demo', pagesDomain: 'Demo.Example.com' }),
    )
    expect(options.pagesDomain).toBe('demo.example.com')
  })

  it('rejects a --pages-domain that is not a bare hostname', async () => {
    for (const pagesDomain of [
      'https://Example.com/app',
      'example.com/app',
      'example.com:8080',
      'exa mple.com',
      'localhost',
      '',
    ]) {
      await expect(plan({ dir: 'demo', pagesDomain })).rejects.toThrow(
        `Invalid --pages-domain "${pagesDomain}"`,
      )
    }
  })

  it('rejects --pages-domain without a GitHub Pages frontend', async () => {
    const message =
      '--pages-domain only applies to frontend projects with github-pages'
    await expect(
      plan({ dir: 'lib', kind: 'library', pagesDomain: 'example.com' }),
    ).rejects.toThrow(message)
    await expect(
      plan({
        dir: 'repo',
        kind: 'monorepo',
        members: 'web:vue',
        pagesDomain: 'example.com',
      }),
    ).rejects.toThrow(message)
    await expect(
      plan({ dir: 'demo', features: 'vitest', pagesDomain: 'example.com' }),
    ).rejects.toThrow(message)
  })

  it('uses React equivalents of the preset for --framework react', async () => {
    const options = projectOptions(
      await plan({ dir: 'demo', framework: 'react' }),
    )
    expect(options.features).toContain('react-router')
    expect(options.features).not.toContain('vue-router')
  })

  it('splits features between the monorepo root and members', async () => {
    const result = await plan({
      dir: 'repo',
      kind: 'monorepo',
      members: 'web:react,shared:library',
    })
    if (result.type !== 'workspace') throw new Error('expected a workspace')
    expect(result.options.features).toEqual([
      'prettier',
      'husky',
      'github-actions',
      'agent-docs',
    ])
    expect(result.members.map((member) => member.name)).toEqual([
      'web',
      'shared',
    ])
    expect(result.members[0]?.features).toContain('react-router')
    expect(result.members[0]?.features).not.toContain('github-pages')
  })

  it('rejects malformed --members', async () => {
    await expect(
      plan({ dir: 'repo', kind: 'monorepo', members: 'web:svelte' }),
    ).rejects.toThrow('Unknown project type "svelte"')
    await expect(
      plan({ dir: 'repo', kind: 'monorepo', members: 'Web:vue' }),
    ).rejects.toThrow('Invalid project name in --members: Web')
  })
})

describe('resolveCreatePlan with prompts', () => {
  it('offers React as a selectable framework', async () => {
    const { prompter, asked } = scriptedPrompter({ Framework: 'react' })
    const options = projectOptions(await plan({ dir: 'demo' }, prompter))

    expect(options.framework).toBe('react')
    const question = asked.find((entry) => entry.message === 'Framework')
    expect(question?.choices).toContainEqual({ value: 'react', label: 'React' })
  })

  it('does not ask what flags already answered', async () => {
    const { prompter, asked } = scriptedPrompter()
    await plan(
      { dir: 'demo', kind: 'frontend', framework: 'vue', pm: 'bun' },
      prompter,
    )
    expect(asked.map((entry) => entry.message)).toEqual([
      'Linter',
      'Formatter',
      'Features',
      // The preset selects GitHub Pages, which has its own question.
      'Custom domain for GitHub Pages (leave empty to use <user>.github.io/<repo>)',
    ])
  })

  it('asks nothing with --yes or a preset', async () => {
    for (const args of [{ yes: true }, { preset: 'lynn' }]) {
      const { prompter, asked } = scriptedPrompter()
      await plan({ dir: 'demo', ...args }, prompter)
      expect(asked).toEqual([])
    }
  })

  it('turns linter and formatter answers into features', async () => {
    const { prompter } = scriptedPrompter({
      Linter: 'both',
      Formatter: 'oxfmt',
      Features: ['vitest'],
    })
    const options = projectOptions(
      await plan({ dir: 'demo', framework: 'vue' }, prompter),
    )
    expect(options.features).toEqual(['oxlint', 'eslint', 'oxfmt', 'vitest'])
  })

  it('preselects the preset linter and formatter', async () => {
    const { prompter, asked } = scriptedPrompter()
    const options = projectOptions(
      await plan({ dir: 'demo', framework: 'vue' }, prompter),
    )
    expect([...options.features].sort()).toEqual(
      presetFeatures(presets.lynn, 'frontend', 'vue').sort(),
    )
    expect(asked.map((entry) => entry.message)).toContain('Linter')
  })

  it('asks for a package name only for libraries', async () => {
    const { prompter } = scriptedPrompter({
      'Project kind': 'library',
      'Package name': '@me/lib',
    })
    expect(projectOptions(await plan({ dir: 'lib' }, prompter)).name).toBe(
      '@me/lib',
    )
  })

  it('accepts "." as the project directory when its name is valid', async () => {
    const cwd = process.cwd()
    const dir = await mkdtemp(join(tmpdir(), 'create-web-'))
    const app = join(dir, 'my-app')
    await mkdir(app)
    try {
      process.chdir(app)
      const { prompter } = scriptedPrompter({ 'Project directory': '.' })
      const result = await plan({}, prompter)
      expect(basename(result.root)).toBe('my-app')
    } finally {
      process.chdir(cwd)
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('validates the Pages domain answer like the flag', async () => {
    const { prompter } = scriptedPrompter({
      [PAGES_QUESTION]: 'https://example.com/app',
    })
    await expect(
      plan({ dir: 'demo', framework: 'vue' }, prompter),
    ).rejects.toThrow(
      `"https://example.com/app" rejected for ${PAGES_QUESTION}`,
    )

    const upper = scriptedPrompter({ [PAGES_QUESTION]: 'WWW.Example.com' })
    const options = projectOptions(
      await plan({ dir: 'demo', framework: 'vue' }, upper.prompter),
    )
    expect(options.pagesDomain).toBe('www.example.com')
  })

  it('asks for the Pages domain only when GitHub Pages is selected', async () => {
    const { prompter, asked } = scriptedPrompter({
      [PAGES_QUESTION]: 'demo.example.com',
    })
    const options = projectOptions(
      await plan({ dir: 'demo', framework: 'vue' }, prompter),
    )
    expect(options.pagesDomain).toBe('demo.example.com')

    const other = scriptedPrompter({ Features: ['vitest'] })
    await plan({ dir: 'demo', framework: 'vue' }, other.prompter)
    expect(other.asked.map((entry) => entry.message)).not.toContain(
      'Custom domain for GitHub Pages (leave empty to use <user>.github.io/<repo>)',
    )
    expect(asked.length).toBeGreaterThan(0)
  })
})

describe('inspectDir', () => {
  let dir = ''
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'create-web-'))
    await mkdir(join(dir, 'empty'))
    await mkdir(join(dir, 'full'))
    await writeFile(join(dir, 'full', 'x'), '')
    await writeFile(join(dir, 'afile'), '')
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('tells apart missing, empty, non-empty and non-directory paths', async () => {
    expect(await inspectDir(join(dir, 'nope'))).toBe('missing')
    expect(await inspectDir(join(dir, 'empty'))).toBe('empty')
    expect(await inspectDir(join(dir, 'full'))).toBe('not-empty')
    expect(await inspectDir(join(dir, 'afile'))).toBe('not-a-directory')
    expect(await inspectDir(join(dir, 'afile', 'app'))).toBe(
      'parent-not-a-directory',
    )
  })
})

describe('normalizePagesDomain', () => {
  it('accepts bare hostnames and lowercases them', () => {
    expect(normalizePagesDomain('Example.COM')).toBe('example.com')
    expect(normalizePagesDomain('www.my-site.example.co')).toBe(
      'www.my-site.example.co',
    )
  })

  it('rejects anything else', () => {
    for (const value of [
      'https://example.com',
      'example.com/',
      'example.com:443',
      ' example.com',
      'example',
      'example..com',
      '-bad.example.com',
      'example.com.',
      '*.example.com',
    ]) {
      expect(normalizePagesDomain(value)).toBeUndefined()
    }
  })
})

describe('promptFeatures', () => {
  const byId = (...ids: string[]) =>
    registry.filter((feature) => ids.includes(feature.id))
  const messages = (asked: { message: string }[]) =>
    asked.map((entry) => entry.message)
  const offered = (
    asked: { message: string; choices?: Choice<string>[] }[],
    message: string,
  ) =>
    asked
      .find((entry) => entry.message === message)
      ?.choices?.map((choice) => choice.value)

  it('skips the formatter question for monorepo members', async () => {
    const candidates = memberCandidates('frontend', 'vue')
    const { prompter, asked } = scriptedPrompter({ Linter: 'eslint' })
    const features = await promptFeatures(prompter, ['eslint'], candidates)
    expect(messages(asked)).toEqual(['Linter', 'Features'])
    expect(features).toContain('eslint')
    expect(features).not.toContain('prettier')
  })

  it('skips the linter question when no linter is a candidate', async () => {
    const { prompter, asked } = scriptedPrompter()
    const features = await promptFeatures(
      prompter,
      ['prettier', 'vitest'],
      byId('prettier', 'oxfmt', 'vitest'),
    )
    expect(messages(asked)).toEqual(['Formatter', 'Features'])
    expect(features).toEqual(['prettier', 'vitest'])
  })

  it('offers only choices whose features are all candidates', async () => {
    const { prompter, asked } = scriptedPrompter()
    const features = await promptFeatures(
      prompter,
      ['oxlint', 'eslint', 'prettier'],
      byId('eslint', 'prettier'),
    )
    expect(offered(asked, 'Linter')).toEqual(['eslint', 'none'])
    expect(offered(asked, 'Formatter')).toEqual(['prettier', 'none'])
    expect(features).toEqual(['eslint', 'prettier'])
  })
})
