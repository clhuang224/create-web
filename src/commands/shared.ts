import { spawn } from 'node:child_process'
import * as p from '@clack/prompts'

export function exitIfCancelled<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.')
    process.exit(0)
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
