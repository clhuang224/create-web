import { describe, expect, it } from 'vitest'
import type { Feature } from './feature.ts'
import { ResolveError, resolveFeatures } from './resolver.ts'

const feature = (partial: Partial<Feature> & Pick<Feature, 'id'>): Feature => ({
  label: partial.id,
  kinds: ['frontend'],
  apply: () => {},
  ...partial,
})

const registry = [
  feature({ id: 'agent-docs', after: ['husky'] }),
  feature({ id: 'husky', after: ['eslint'] }),
  feature({ id: 'eslint', frameworks: ['vue'] }),
  feature({ id: 'github-pages', requires: ['github-actions'] }),
  feature({ id: 'github-actions' }),
  feature({ id: 'prettier', conflicts: ['oxfmt'] }),
  feature({ id: 'oxfmt' }),
]

const ids = (features: Feature[]) => features.map((f) => f.id)

describe('resolveFeatures', () => {
  it('adds required features automatically', () => {
    const resolved = resolveFeatures(registry, {
      kind: 'frontend',
      framework: 'vue',
      features: ['github-pages'],
    })
    expect(ids(resolved)).toEqual(['github-actions', 'github-pages'])
  })

  it('orders features by `after` only when both are selected', () => {
    const resolved = resolveFeatures(registry, {
      kind: 'frontend',
      framework: 'vue',
      features: ['agent-docs', 'eslint', 'husky'],
    })
    expect(ids(resolved)).toEqual(['eslint', 'husky', 'agent-docs'])
    expect(
      ids(
        resolveFeatures(registry, {
          kind: 'frontend',
          framework: 'vue',
          features: ['agent-docs'],
        }),
      ),
    ).toEqual(['agent-docs'])
  })

  it('rejects unsupported frameworks, kinds and unknown ids', () => {
    expect(() =>
      resolveFeatures(registry, {
        kind: 'frontend',
        framework: 'react',
        features: ['eslint'],
      }),
    ).toThrow(ResolveError)
    expect(() =>
      resolveFeatures(registry, {
        kind: 'library',
        framework: 'vue',
        features: ['husky'],
      }),
    ).toThrow(ResolveError)
    expect(() =>
      resolveFeatures(registry, {
        kind: 'frontend',
        framework: 'vue',
        features: ['pinia'],
      }),
    ).toThrow(/Unknown feature/)
  })

  it('rejects conflicting features in either direction', () => {
    expect(() =>
      resolveFeatures(registry, {
        kind: 'frontend',
        framework: 'vue',
        features: ['oxfmt', 'prettier'],
      }),
    ).toThrow(/cannot be used together/)
  })
})
