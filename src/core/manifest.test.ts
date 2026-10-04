import { describe, expect, it } from 'vitest'
import { hashContent } from './manifest.ts'

describe('hashContent', () => {
  it('ignores the difference between LF and CRLF line endings', () => {
    expect(hashContent('a\r\nb\r\n')).toBe(hashContent('a\nb\n'))
    expect(hashContent('a\nb\n')).not.toBe(hashContent('a\nc\n'))
  })
})
