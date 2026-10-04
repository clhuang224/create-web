import type { Feature } from '../core/feature.ts'
import type { FeatureId } from '../core/types.ts'
import type { Prompter } from './prompter.ts'

type Choices = Record<string, { label: string; ids: FeatureId[] }>

const LINTERS: Choices = {
  eslint: { label: 'ESLint', ids: ['eslint'] },
  oxlint: { label: 'oxlint', ids: ['oxlint'] },
  both: { label: 'oxlint + ESLint', ids: ['oxlint', 'eslint'] },
  none: { label: 'None', ids: [] },
}

const FORMATTERS: Choices = {
  prettier: { label: 'Prettier', ids: ['prettier'] },
  oxfmt: { label: 'oxfmt', ids: ['oxfmt'] },
  none: { label: 'None', ids: [] },
}

/**
 * Linter and formatter are single choices; everything else is a checklist.
 * Only choices whose features are all candidates are offered, and a question
 * is skipped when no candidate falls in its category (e.g. monorepo members,
 * whose formatter belongs to the root).
 */
export async function promptFeatures(
  prompter: Prompter,
  initial: FeatureId[],
  candidates: Feature[],
): Promise<FeatureId[]> {
  const available = new Set(candidates.map((feature) => feature.id))
  const ask = async (
    message: string,
    category: NonNullable<Feature['category']>,
    choices: Choices,
  ): Promise<FeatureId[]> => {
    if (!candidates.some((feature) => feature.category === category)) return []
    const offered = Object.entries(choices).filter(([, { ids }]) =>
      ids.every((id) => available.has(id)),
    )
    // Check "both" before the single linters so it wins when both are selected.
    const initialChoice =
      [...offered]
        .sort(([, a], [, b]) => b.ids.length - a.ids.length)
        .find(
          ([, { ids }]) =>
            ids.length > 0 && ids.every((id) => initial.includes(id)),
        )?.[0] ?? 'none'
    const answer = await prompter.select(
      message,
      offered.map(([value, { label }]) => ({ value, label })),
      initialChoice,
    )
    return choices[answer]?.ids ?? []
  }

  const linter = await ask('Linter', 'linter', LINTERS)
  const formatter = await ask('Formatter', 'formatter', FORMATTERS)
  const others = candidates.filter((feature) => !feature.category)
  const selected = await prompter.multiselect<FeatureId>(
    'Features',
    others.map((feature) => ({
      value: feature.id,
      label: feature.label,
      hint: feature.hint,
    })),
    others.map((feature) => feature.id).filter((id) => initial.includes(id)),
  )
  return [...linter, ...formatter, ...selected]
}
