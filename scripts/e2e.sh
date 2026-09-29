#!/usr/bin/env sh
# Generates a project per framework with the lynn preset, installs it, and runs its own checks.
set -eu

cli="$(pwd)/dist/cli.mjs"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

for framework in ${E2E_FRAMEWORKS:-vue react}; do
  echo "==== $framework"
  cd "$workdir"
  node "$cli" "e2e-$framework" --yes --framework "$framework"
  cd "e2e-$framework"

  for script in lint typecheck format:check test build; do
    echo "== $framework: $script"
    pnpm run "$script"
  done
done
