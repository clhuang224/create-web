# Plan

Product and architecture direction for Web Starter CLI. Record decisions here; keep concrete task lists elsewhere once implementation starts.

## Goals

- Scaffold new projects with the author's own conventions (hooks, CI, lint/format, docs skeleton, deploy), not just a framework template.
- Add features to existing projects (`add` command) through the same code path used for creation.
- Personal use first. Published to npm for convenience, not for broad adoption.

## Non-goals (for now)

- Supporting every combination of options. Favor a strong default preset over option breadth.
- Resolving the latest dependency versions at generation time. Versions are pinned in the tool; "it works" beats "it is newest".

## Decisions

| Topic               | Decision                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Audience            | Author first; opinionated defaults. Public docs are written for other users too                                                          |
| Output shape        | Single project or monorepo (`--kind monorepo`)                                                                                            |
| Existing projects   | Supported via `add <feature>`                                                                                                           |
| Dependency versions | Pinned in the tool, bumped manually                                                                                                     |
| Distribution        | Public npm as `@clhuang224/create-web` (`pnpm create @clhuang224/web`)                                                                  |
| Tool repo tooling   | pnpm, TypeScript strict, tsdown, Vitest, ESLint + Prettier, husky; same conventions as generated projects                               |
| Commit lint         | Plain shell `commit-msg` hook (Conventional Commits regex), no extra dependency; Commitlint optional at most                 |
| Env variables       | Framework/Vite built-in for frontend; dotenv only for Node/backend kinds                                                                |
| Linter / formatter | ESLint, oxlint, or both; Prettier or oxfmt (mutually exclusive). With both linters, `lint` runs `oxlint && eslint .` and ESLint uses eslint-plugin-oxlint to skip overlapping rules. oxfmt is configured to match Prettier's output (`printWidth: 80`, no package.json sorting). `lynn` uses ESLint + Prettier |
| React routing | React Router in declarative mode (`BrowserRouter` + `<Routes>`), matching the static SPA deploy; framework mode is deferred with other SSR options |
| Global dotfiles | Referenced, never installed. `create-web` only writes inside the project directory. Generated `AGENTS.md` / `CLAUDE.md` may point to `clhuang224/dotfiles` for general habits, but must stay self-contained for rules the project enforces (e.g. commit format checked by hooks), since cloud sessions, CI agents and other contributors do not have the dotfiles |
| License | MIT |

## Architecture

Hybrid of layered templates and feature modules.

### Project kinds

The first prompt picks a kind. Each kind has its own base template and its own set of applicable features.

- `frontend`: SPA built with Vite
- `library`: TypeScript package built with tsdown (ESM + declarations, `platform: 'neutral'`), publishable to npm
- `backend`: API server (framework TBD, e.g. NestJS / Elysia / Hono)
- `monorepo`: workspace root that composes other kinds under `apps/*` and `packages/*`

A monorepo is not a separate generator: it is a workspace root plus N projects produced by the other kinds (`src/core/workspace.ts`). `create-web add-member <name> --type vue|react|library` adds a project later through the same pipeline.

- **Root** (`kind: monorepo`): `pnpm-workspace.yaml` or `package.json` `workspaces`, root scripts that fan out (`pnpm -r --if-present run <script>` / `bun run --filter '*' --if-present <script>`), and the features whose `kinds` include `monorepo`: formatter, husky, GitHub Actions, agent docs.
- **Members**: frontend apps under `apps/<name>`, libraries under `packages/<name>`, named `@<root>/<name>`. They get linters, tests and framework features, but no root-owned files (`.gitignore`, `.editorconfig`, `packageManager`, `engines`).
- **One feature list, split**: `create` takes a single feature list and assigns each feature to the root or to the members that support it; features that fit neither are rejected.
- **Inherited features**: each member's manifest records the root's features under `workspace.inherited`. They count for `ctx.has` (e.g. ESLint turns on `skipFormatting` because the root has Prettier) but are never applied in the member. `create-web add` inside a member refuses root-owned features.
- **Standalone-only features**: `github-pages` and `publish` write workflows that assume the project is at the repository root, so they are marked `standaloneOnly` and are not offered inside a monorepo yet.

### Pipeline

```text
prompts / flags / preset
        │
        ▼
    resolver ── validates compatibility (kind × framework × feature), fills defaults
        │
        ▼
  context (detected or chosen: kind, framework, package manager, existing files)
        │
        ▼
  base template (create only) + feature modules apply()
        │
        ▼
  virtual file system ── dry-run / diff preview
        │
        ▼
  write to disk, install, git init (create only)
```

- **Base templates**: one minimal, runnable project per kind × framework, copied as files.
- **Feature modules**: each declares `id`, `kinds`, `requires`, `conflicts`, `detect(ctx)` and `apply(ctx)`. `apply` adds dependencies, scripts and files through the context API rather than writing to disk directly.
- **Shared files** (`package.json`, `vite.config.ts`, `eslint.config.*`, `.husky/*`, CI workflows): built from structured data contributed by features during `create`. During `add`, existing files are edited with AST tooling (e.g. magicast); when an edit cannot be made safely, print manual instructions instead of guessing.
- Prefer features that own separate config files (e.g. `vitest.config.ts` apart from `vite.config.ts`) to reduce edits to shared files.
- **Manifest** (`.create-web.json`): generated projects record their choices in a small manifest file so `add` can rely on it. `add` is only guaranteed on projects with a manifest; projects without one fall back to detection (best effort).
- **Entry routing**: `pnpm create @clhuang224/web my-app` invokes the bin as `create-web my-app`, so a first argument that is not a known subcommand must be routed to `create`. citty's `default` subcommand only covers the no-argument case, so this needs a small pre-parse in `src/cli.ts`.
- **Sync and managed blocks**: files derived from project state (Git hooks, CI matrix, `AGENTS.md` command list) contain blocks between `create-web:start <id>` / `create-web:end <id>` comments. Each present feature's `sync` rewrites its blocks after every run, so a feature added later (e.g. `vitest` after `husky`) is reflected everywhere. Content outside the markers belongs to the user; missing markers become a manual step.
- **Generated config files**: config files whose content depends on other features (`eslint.config.js`, `.oxlintrc.json`) are written with `ctx.writeGenerated`, which records their hash in the manifest. A later `add` regenerates them only if the hash still matches (the user has not edited them); otherwise it reports what to change.
- **Presets**: named option sets. A preset without an explicit feature list selects every feature that supports the chosen framework, so `lynn` works for both Vue and React; `lynn` reproduces the author's usual setup in one step. Every prompt also has a CLI flag so generation is scriptable and testable.

### Author conventions to generate

Conventions every generated project gets:

- `.husky/commit-msg` with the Conventional Commits regex
- `.husky/pre-commit` running lint and typecheck; `.husky/pre-push` running tests (in monorepos these run every workspace's checks; see Known Limitations)
- `.github/actions/setup-<pm>` composite action, check workflow (lint / typecheck / test), deploy workflow
- GitHub Pages deploy with SPA `404.html` fallback, optional `CNAME`
- `AGENTS.md` / `CLAUDE.md` skeleton, `docs/plan.md`, `docs/architecture.md`
- `packageManager` and `engines` fields in `package.json`
- Prettier (`semi: false`, `singleQuote: true`) or oxfmt; ESLint, oxlint, or both

### Testing the tool

- Unit tests (Vitest) for the resolver and each feature's `apply`.
- Snapshot tests of generated file trees for representative option sets.
- CI job that generates a few representative projects, installs them, and runs lint / typecheck / test / build.

## Roadmap

1. `frontend` kind: Vue and React SPA, `lynn` preset, pnpm and bun. Vue and React are done.
2. `add` command for features on existing frontend projects. Done for projects with a manifest; detection-based fallback is not implemented.
3. `library` kind. Done; no framework, features limited to tooling (Vitest, linters, formatters, hooks, CI, publish workflow, agent docs).
4. `monorepo` kind composing frontend and library. Done.
5. `backend` kind.
6. Deferred items below.

## Follow-ups

Known issues and design changes. Check items off as they land.

Fixes:

- [x] `generate` re-hashes generated files it did not write, so a config the user edited is recorded as "generated" and overwritten by the next `add`.
- [x] `add` overwrites existing files (`copyTemplate`) and scripts (`addScripts`) without checking.
- [x] `create` does not validate `--pm` (and relies on downstream errors for `--kind` / `--framework`).
- [x] `runProcess` spawns `pnpm` / `bun` / `git` without a shell, which fails on Windows (`pnpm.cmd`).
- [x] Cancelling a prompt exits with code 0.
- [x] Generated `AGENTS.md` always says pre-commit runs lint, typecheck and format check, even when those scripts do not exist.
- `create-web help` running `create help` is intended (any non-subcommand argument is a project directory).

Design:

- [x] Split `create` into a pure option-resolution step and a prompt layer, and unit-test the resolution.
- [x] `remove` command, so e.g. Prettier can be swapped for oxfmt.
- [x] Generated GitHub Pages deploys only after CI passes.
- [x] create-web's own publish workflow (and the generated library publish workflow) runs the full checks first.
- [x] Evaluate release automation (semantic-release and alternatives) and a way to keep `src/versions.ts` current.
- [x] Format written files with the project's own formatter after install (was: always Prettier).
- The `sync` order and manifest migrations are deferred; see Known Limitations.

## Release Automation (evaluation, not decided)

Two separate problems:

1. **Releasing create-web itself** (version, tag, changelog, publish). Today: bump `package.json` by hand, commit, push a `v*` tag; `publish.yml` runs CI and publishes.
2. **Keeping `src/versions.ts` current** (the dependency versions written into generated projects). Today: manual.

Options for (1):

| Tool | How it works | Fit |
| --- | --- | --- |
| semantic-release | On every push to `main`, reads Conventional Commits since the last tag, picks the next version, tags, publishes and writes GitHub release notes. No version commit in the repo by default. | Fully automatic: every `feat`/`fix` merged to `main` ships. Conflicts with asking before each release, and with the rule that every push needs its own approval, since a push to `main` becomes a release. Large plugin setup (npm, GitHub, changelog, git). |
| release-please | Keeps an open "release PR" that accumulates Conventional Commits, bumps `package.json` and `CHANGELOG.md`. Merging that PR creates the tag and GitHub release; the existing `publish.yml` then publishes. | Same commit-based versioning, but releasing stays an explicit, reviewable step (merging the PR). Small config, works with prereleases. |
| Changesets | Contributors add changeset files describing each change; a bot PR bumps versions. | Built for multi-package monorepos and teams; extra files per change are overhead for a single personal package. |

Recommendation for (1): **release-please**. It reuses the Conventional Commits already enforced, removes the manual version bump and changelog, and keeps a human decision before each release.

Options for (2): Renovate with a regex custom manager can read the `'package': '^x.y.z'` entries in `src/versions.ts` and open update PRs (Dependabot cannot parse custom files). A lighter alternative is a `versions:outdated` script that compares `src/versions.ts` with the npm registry, run by hand before a release. Either way `pnpm run e2e` must pass before merging a bump, which CI already enforces.

## Known Limitations

- `remove` only covers tooling features. Pinia, the routers, Redux and Tailwind edit `main.ts` / `main.tsx`, `App` and the Vite config, and undoing those edits safely is not implemented; they are reported as not removable.

- `sync` hooks run in registry order, and some depend on that implicitly: husky's `sync` must run after the linters' `sync` because the `lint` script is set there. Nothing enforces this; `after` only orders `apply`. Reordering the registry could silently produce hooks without `lint`.
- The manifest has no schema version or migrations. Fields added later (like `generated`) are simply absent in older projects, which then behave as if every config file was edited. A future format change needs a `schemaVersion` and upgrade steps.
- create-web formats the files it writes with its built-in Prettier settings, then, after a successful install, runs the project's own formatter (Prettier or oxfmt, from the monorepo root for members) on just those files and re-hashes the generated configs it wrote. With `--no-install` or a failed install only the built-in pass happens, so a project whose formatter config differs from create-web's defaults (e.g. `semi: true`) needs `format` run by hand.

- Adding a root feature later (e.g. a formatter) does not update members: their ESLint configs will not pick up `skipFormatting` until regenerated. Running `sync` across members is not implemented.
- Git hooks in a monorepo run every workspace's checks; they are not path-scoped yet (running only the checks of workspaces with staged changes).
- Members are independent: `create-web` does not add `workspace:*` dependencies between them. An app that uses a library member must add the dependency and build the library first (its `exports` point to `dist`).
- The e2e check covers pnpm monorepos only; bun workspaces are covered by unit tests.
- Generated config files from before hash tracking (projects created before this was added) are treated as edited, so `add` reports manual steps for them instead of updating them.

## Deferred

### Angular

Angular is driven by Angular CLI (`@angular/build`, `angular.json`) instead of a user-owned Vite config, so most shared-file builders do not apply. Plan to treat it as a separate base template with its own feature implementations. Defaults follow the author's global rules: standalone components + Signals, zoneless, Vitest. NgRx is optional since Signals cover most state needs.

### Svelte

Svelte Navigator is unmaintained (Svelte 3 only). Routing will likely come from SvelteKit; state from Svelte 5 runes rather than a separate library.

### Meta frameworks and SSR

Nuxt, SvelteKit, and React Router framework mode. These change the deploy story (SSR/SSG vs static GitHub Pages), so they come after the SPA path is stable.

## Open questions

- Backend framework choices for the `backend` kind.
