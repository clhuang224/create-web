import * as p from '@clack/prompts'
import type { Feature } from '../core/feature.ts'
import type { FeatureId } from '../core/types.ts'
import { exitIfCancelled } from './shared.ts'

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
  initial: FeatureId[],
  candidates: Feature[],
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
  const others = candidates.filter((feature) => !feature.category)
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
