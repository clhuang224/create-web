import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // A project without tests yet should not fail hooks and CI.
    passWithNoTests: true,
  },
})
