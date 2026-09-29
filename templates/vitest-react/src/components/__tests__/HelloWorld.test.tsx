import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HelloWorld from '../HelloWorld.tsx'

describe('HelloWorld', () => {
  it('renders the message', () => {
    render(<HelloWorld msg="Hello Vitest" />)
    expect(screen.getByRole('heading').textContent).toBe('Hello Vitest')
  })
})
