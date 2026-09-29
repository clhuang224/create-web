import { describe, expect, it } from 'vitest'
import { greet } from './index.ts'

describe('greet', () => {
  it('greets by name', () => {
    expect(greet('world')).toBe('Hello, world!')
  })
})
