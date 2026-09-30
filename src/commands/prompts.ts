import type { Feature } from '../core/feature.ts'
import type { FeatureId } from '../core/types.ts'
import type { Prompter } from './prompter.ts'

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
export async function promptFeatures(
  prompter: Prompter,
  initial: FeatureId[],
  candidates: Feature[],
): Promise<FeatureId[]> {
  // Check "both" before the single linters so it wins when both are selected.
  const initialChoice = (choices: typeof LINTERS) =>
    Object.entries(choices)
      .sort(([, a], [, b]) => b.ids.length - a.ids.length)
      .find(
        ([, { ids }]) =>
          ids.length > 0 && ids.every((id) => initial.includes(id)),
      )?.[0] ?? 'none'
  const toChoices = (choices: typeof LINTERS) =>
    Object.entries(choices).map(([value, { label }]) => ({ value, label }))

  const linter = await prompter.select(
    'Linter',
    toChoices(LINTERS),
    initialChoice(LINTERS),
  )
  const formatter = await prompter.select(
    'Formatter',
    toChoices(FORMATTERS),
    initialChoice(FORMATTERS),
  )
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
  return [
    ...(LINTERS[linter]?.ids ?? []),
    ...(FORMATTERS[formatter]?.ids ?? []),
    ...selected,
  ]
}
