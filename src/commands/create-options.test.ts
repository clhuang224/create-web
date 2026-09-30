import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { presetFeatures, presets } from '../presets.ts'
import {
  type CreateArgs,
  type CreatePlan,
  resolveCreatePlan,
  UsageError,
} from './create-options.ts'
import type { Choice, Prompter } from './prompter.ts'

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
    async text(message, { defaultValue }) {
      asked.push({ message })
      return (answers[message] as string | undefined) ?? defaultValue
    },
  }
  return { prompter, asked }
}

const emptyDir = async () => true

const plan = (args: CreateArgs, prompter?: Prompter) =>
  resolveCreatePlan(args, { prompter, isEmptyDir: emptyDir })

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

  it('rejects flags that do not fit the project kind', async () => {
    await expect(
      plan({ dir: 'demo', kind: 'library', framework: 'vue' }),
    ).rejects.toThrow('--framework does not apply to library projects')
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
      resolveCreatePlan({ dir: 'demo' }, { isEmptyDir: async () => false }),
    ).rejects.toThrow('demo already exists and is not empty.')
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

  it('asks for the Pages domain only when GitHub Pages is selected', async () => {
    const { prompter, asked } = scriptedPrompter({
      'Custom domain for GitHub Pages (leave empty to use <user>.github.io/<repo>)':
        'demo.example.com',
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
