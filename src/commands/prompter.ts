import * as p from '@clack/prompts'
import { exitIfCancelled } from './shared.ts'

export interface Choice<T extends string> {
  value: T
  label: string
  hint?: string
  disabled?: boolean
}

/**
 * The questions commands ask, independent of the prompt library, so option
 * resolution can be unit-tested with scripted answers.
 */
export interface Prompter {
  select<T extends string>(
    message: string,
    choices: Choice<T>[],
    initialValue?: T,
  ): Promise<T>
  multiselect<T extends string>(
    message: string,
    choices: Choice<T>[],
    initialValues: T[],
  ): Promise<T[]>
  text(
    message: string,
    options: {
      defaultValue: string
      placeholder?: string
      validate?: (value: string) => string | undefined
    },
  ): Promise<string>
}

// clack types options with a conditional type that TypeScript cannot resolve
// for a generic T, so these call clack with `string` and narrow the answer
// back; clack only ever returns one of the given choice values.
export const clackPrompter: Prompter = {
  async select<T extends string>(
    message: string,
    choices: Choice<T>[],
    initialValue?: T,
  ) {
    const answer = exitIfCancelled(
      await p.select<string>({ message, options: choices, initialValue }),
    )
    return answer as T
  },
  async multiselect<T extends string>(
    message: string,
    choices: Choice<T>[],
    initialValues: T[],
  ) {
    const answers = exitIfCancelled(
      await p.multiselect<string>({
        message,
        options: choices,
        initialValues,
        required: false,
      }),
    )
    return answers as T[]
  },
  async text(message, { defaultValue, placeholder, validate }) {
    return exitIfCancelled(
      await p.text({
        message,
        defaultValue,
        placeholder,
        validate: validate && ((value) => validate(value ?? '')),
      }),
    )
  },
}
