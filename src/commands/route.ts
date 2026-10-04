const TOP_LEVEL_FLAGS = ['--help', '-h', '--version', '-v']

/**
 * `pnpm create @clhuang224/web my-app` runs `create-web my-app`, so anything
 * that is not a subcommand or a top-level flag is treated as arguments to
 * `create`. Only own keys count as subcommands, so directory names such as
 * `constructor` or `valueOf` are not mistaken for inherited object members.
 */
export function routeArgs(
  args: string[],
  subCommands: Record<string, unknown>,
): string[] {
  const [first] = args
  return first !== undefined &&
    (Object.hasOwn(subCommands, first) || TOP_LEVEL_FLAGS.includes(first))
    ? args
    : ['create', ...args]
}
