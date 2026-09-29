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
| Output shape        | Single project first; monorepo later (see Roadmap)                                                                                      |
| Existing projects   | Supported via `add <feature>`                                                                                                           |
| Dependency versions | Pinned in the tool, bumped manually                                                                                                     |
| Distribution        | Public npm as `@clhuang224/create-web` (`pnpm create @clhuang224/web`)                                                                  |
| Tool repo tooling   | pnpm, TypeScript strict, tsdown, Vitest, ESLint + Prettier, husky; same conventions as generated projects                               |
| Commit lint         | Plain shell `commit-msg` hook (Conventional Commits regex), as used in `bus` and `queener`; Commitlint optional at most                 |
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

A monorepo is not a separate generator: it is a workspace root plus N projects produced by the other kinds. `add app <kind>` inside a monorepo reuses the same pipeline.

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

Derived from `bus`, `queener` and `milestone-checker`:

- `.husky/commit-msg` with the Conventional Commits regex
- `.husky/pre-commit` running lint and typecheck; `.husky/pre-push` running tests (path-scoped in monorepos)
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
4. `monorepo` kind composing frontend and library.
5. `backend` kind.
6. Deferred items below.

## Known Limitations

- Generated config files from before hash tracking (projects created before this was added) are treated as edited, so `add` reports manual steps for them instead of updating them.

## Deferred

### Angular

Angular is driven by Angular CLI (`@angular/build`, `angular.json`) instead of a user-owned Vite config, so most shared-file builders do not apply. Plan to treat it as a separate base template with its own feature implementations. Defaults follow the author's global rules: standalone components + Signals, zoneless, Vitest. NgRx is optional since Signals cover most state needs.

### Svelte

Svelte Navigator is unmaintained (Svelte 3 only). Routing will likely come from SvelteKit; state from Svelte 5 runes rather than a separate library.

### Meta frameworks and SSR

Nuxt, SvelteKit, and React Router framework mode (as used in `bus`). These change the deploy story (SSR/SSG vs static GitHub Pages), so they come after the SPA path is stable.

## Open questions

- Backend framework choices for the `backend` kind.
