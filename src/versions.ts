/**
 * Dependency versions written into generated projects. Pinned on purpose:
 * bump them together and re-run the end-to-end check.
 */
export const versions = {
  pnpm: '11.6.0',
  bun: '1.3.10',
  node: '24',

  vue: '^3.5.43',
  'vue-router': '^5.3.1',
  pinia: '^4.0.3',
  vite: '^8.3.1',
  '@vitejs/plugin-vue': '^6.0.9',
  'vue-tsc': '^3.3.11',
  '@vue/tsconfig': '^0.9.1',
  '@tsconfig/node24': '^24.0.5',
  typescript: '~6.0.3',
  '@types/node': '^24.19.0',

  vitest: '^5.0.2',
  '@vue/test-utils': '^2.5.1',
  jsdom: '^30.1.1',
  '@types/jsdom': '^30.0.0',

  eslint: '^10.11.0',
  'eslint-plugin-vue': '^10.11.1',
  '@vue/eslint-config-typescript': '^14.9.0',
  'eslint-config-prettier': '^10.1.8',
  prettier: '^3.9.9',

  tailwindcss: '^4.3.3',
  '@tailwindcss/vite': '^4.3.3',

  husky: '^9.1.7',
} as const

export type VersionedPackage = keyof typeof versions

export function pick<const K extends VersionedPackage>(...names: K[]) {
  const picked: Partial<Record<K, string>> = {}
  for (const name of names) picked[name] = versions[name]
  return picked as Record<K, string>
}
