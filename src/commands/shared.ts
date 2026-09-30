import { spawn } from 'node:child_process'
import * as p from '@clack/prompts'
import type { PackageManager } from '../core/types.ts'

export function exitIfCancelled<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.')
    // 130 is the conventional exit code for a run interrupted with Ctrl+C.
    process.exit(130)
  }
  // isCancel only narrows to the cancel symbol, so TypeScript cannot narrow the rest.
  return value as Exclude<T, symbol>
}

export function runProcess(
  command: string,
  args: string[],
  cwd: string,
  quiet = false,
) {
  return new Promise<number>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: quiet ? 'ignore' : 'inherit',
      // On Windows, pnpm and bun are .cmd shims that only resolve through a
      // shell. Arguments here are fixed words, never user input, so no quoting is needed.
      shell: process.platform === 'win32',
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

export function showNotes(notes: string[]) {
  if (notes.length > 0)
    p.note(notes.map((note) => `- ${note}`).join('\n'), 'Manual steps')
}

export function parseList(value: string | undefined) {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * Installs dependencies after create-web changed package.json. pnpm freezes
 * the lockfile in CI by default, which would reject exactly the dependency
 * changes create-web just made, so it is told not to.
 */
export function installDependencies(
  packageManager: PackageManager,
  cwd: string,
) {
  const args =
    packageManager === 'pnpm'
      ? ['install', '--no-frozen-lockfile']
      : ['install']
  return runProcess(packageManager, args, cwd)
}
