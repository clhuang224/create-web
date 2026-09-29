# Project Guide

This repository is `@clhuang224/create-web`, a personal CLI that scaffolds web projects and adds features to existing ones using the author's own conventions.

## Documentation Ownership

- `README.md`: user-facing overview and usage, in English.
- `docs/README.zh-TW.md`: Traditional Chinese translation of `README.md`. Update both together.
- `docs/plan.md`: product direction, architecture decisions, roadmap, and deferred items.

Record new architecture decisions in `docs/plan.md` instead of scattering them across code comments.

## Commands

- `pnpm run build`: bundle the CLI into `dist/` with tsdown
- `pnpm run dev`: rebuild on change
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run format` / `pnpm run format:check`
- `pnpm run test`

Try the built CLI with `node dist/cli.mjs`.

## Git Hooks

- `commit-msg`: Conventional Commits header check.
- `pre-commit`: lint, typecheck, and format check; skipped when only Markdown or `docs/` files are staged.
- `pre-push`: tests.

## Code Rules

- TypeScript strict mode; do not use `any`.
- Keep dependency versions used in generated projects pinned in the tool (see `docs/plan.md`).
- Feature modules must not write to disk directly; they go through the context API so `create` and `add` share one code path.

## Commit Rules

Follow Conventional Commits: `<type>[optional scope]: <description>`.

Use `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `style`, or `perf`. Keep commits small and atomic.
