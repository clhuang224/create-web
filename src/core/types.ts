export type ProjectKind = 'frontend' | 'library' | 'backend' | 'monorepo'

export type Framework = 'vue' | 'react'

export type PackageManager = 'pnpm' | 'bun'

export type FeatureId =
  | 'vue-router'
  | 'pinia'
  | 'vitest'
  | 'eslint'
  | 'prettier'
  | 'tailwind'
  | 'husky'
  | 'github-actions'
  | 'github-pages'
  | 'agent-docs'

export interface ProjectOptions {
  name: string
  kind: ProjectKind
  framework: Framework
  packageManager: PackageManager
  features: FeatureId[]
  /** Custom domain for GitHub Pages; when omitted, the repository name is used as the base path. */
  pagesDomain?: string
}
