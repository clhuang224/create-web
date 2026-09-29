#!/usr/bin/env sh
# Generates a project with the lynn preset, installs it, and runs its own checks.
set -eu

cli="$(pwd)/dist/cli.mjs"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

cd "$workdir"
node "$cli" e2e-app --yes
cd e2e-app

for script in lint typecheck format:check test build; do
  echo "== $script"
  pnpm run "$script"
done
