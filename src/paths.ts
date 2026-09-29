import { fileURLToPath } from 'node:url'

// Resolves to <package root>/templates both from src/ (tests) and dist/ (bundled CLI).
export const templatesDir = fileURLToPath(
  new URL('../templates/', import.meta.url),
)
