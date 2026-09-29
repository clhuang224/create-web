# Project Guide

This repository is `@clhuang224/create-web`, a personal CLI that scaffolds web projects and adds features to existing ones using the author's own conventions.

## Documentation Ownership

- `README.md`: user-facing overview and usage, in English.
- `docs/README.zh-TW.md`: Traditional Chinese translation of `README.md`. Update both together.
- `docs/plan.md`: product direction, architecture decisions, roadmap, and deferred items.

Record new architecture decisions in `docs/plan.md` instead of scattering them across code comments.

## Code Layout

```text
src/
├── cli.ts          # Entry; routes `create-web <dir>` to `create`
├── commands/       # `create` and `add` (prompts, flags, install)
├── core/           # Pipeline: resolver, virtual fs, context, manifest, formatting
├── bases/          # Base project per kind and framework (create only)
├── features/       # Feature modules; `index.ts` is the registry
├── editors/        # Safe edits to shared files (vite config, main.ts, JSON)
├── presets.ts
└── versions.ts     # Pinned dependency versions for generated projects
templates/          # Files copied into generated projects
```

## Adding A Feature

1. Create `src/features/<id>.ts` with `defineFeature`, add the id to `FeatureId`, and register it in `src/features/index.ts`.
2. Put static files under `templates/<name>/` and copy them with `copyTemplate`. A single leading `_` in a file name becomes `.` (npm drops dotfiles like `.gitignore` on publish).
3. Edit shared files only through `src/editors/`. When an edit cannot be made safely (e.g. the user changed the file), call `ctx.note` with a manual step instead of overwriting.
   If a whole config file depends on other features (e.g. `eslint.config.js`), write it in `sync` with `ctx.writeGenerated` and check `ctx.canRegenerate` first, so user edits are never overwritten.
   If a file depends on project state that other features change (scripts, other features), write it with `managedBlock` in `apply` and fill it in `sync`, which runs for every present feature after each `create` or `add`.
4. Add new dependency versions to `src/versions.ts`.
5. Cover it in `src/core/generate.test.ts` and run `pnpm run e2e`.

## Commands

- `pnpm run build`: bundle the CLI into `dist/` with tsdown
- `pnpm run dev`: rebuild on change
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run format` / `pnpm run format:check`
- `pnpm run test`
- `pnpm run e2e`: generate a project with the lynn preset in a temp dir and run its lint, typecheck, format check, tests and build

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
