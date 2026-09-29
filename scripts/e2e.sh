#!/usr/bin/env sh
# Generates projects for representative option sets, installs them, and runs their own checks.
set -eu

cli="$(pwd)/dist/cli.mjs"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# name|create-web flags
cases="
vue|--framework vue
react|--framework react
vue-ox|--framework vue --features oxlint,eslint,oxfmt,vue-router,pinia,vitest,husky
react-ox|--framework react --features oxlint,oxfmt,react-router,redux,vitest
library|--kind library --name @e2e/library
library-ox|--kind library --features oxlint,oxfmt,vitest
"

echo "$cases" | while IFS='|' read -r name flags; do
  [ -n "$name" ] || continue
  echo "==== $name"
  cd "$workdir"
  # shellcheck disable=SC2086 # flags are intentionally split into arguments
  node "$cli" "e2e-$name" --yes $flags
  cd "e2e-$name"

  for script in lint typecheck format:check test build; do
    echo "== $name: $script"
    pnpm run "$script"
  done

  if [ -f tsdown.config.ts ]; then
    echo "== $name: package entry points"
    test -f dist/index.d.ts
    node --input-type=module -e "
      const { greet } = await import('./dist/index.js')
      if (greet('x') !== 'Hello, x!') throw new Error('unexpected output')
    "
  fi
done
