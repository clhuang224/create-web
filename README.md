# create-web

[English](./README.md) | [繁體中文](./docs/README.zh-TW.md)

An opinionated CLI for scaffolding web projects, and for adding features to projects you already have.

Inspired by `create-vite` and `create-vue`, but it sets up more than a framework template: Git hooks, CI, lint and format rules, deployment, and agent instruction files (`AGENTS.md` / `CLAUDE.md`) all come preconfigured and work together.

> [!WARNING]
> This project is in early development and not published to npm yet. Only Vue and React frontend projects are supported so far.

## Usage

Create a new project:

```bash
pnpm create @clhuang224/web my-project
```

Or install it globally, which also lets you add features to an existing project later:

```bash
volta install @clhuang224/create-web
create-web create my-project
create-web add <feature>
```

`add` currently works on projects created by `create-web`, which record their choices in `.create-web.json`.

Some generated files (Git hooks, the CI workflow, `AGENTS.md`) contain blocks between `create-web:start` and `create-web:end` comments. `create-web` keeps those blocks in sync with your scripts whenever you add a feature, so put your own changes outside them.

## Project Kinds

| Kind | Description |
| --- | --- |
| `frontend` | Single-page app built with Vite |
| `library` | TypeScript package ready to publish to npm |
| `backend` | API server |
| `monorepo` | Workspace that combines the kinds above under `apps/*` and `packages/*` |

`frontend` comes first; the other kinds follow. See [docs/plan.md](./docs/plan.md) for the roadmap.

## Options

| Category | Options | Notes |
| --- | --- | --- |
| Framework | Vue / React | Svelte and Angular are planned |
| Routing | Vue Router / React Router | Depends on the framework |
| State Management | Pinia / Redux Toolkit | Depends on the framework |
| Build Tool | Vite | |
| Package Manager | pnpm / bun | Hooks, CI and scripts adapt to the choice |
| Linter | ESLint / oxlint / both | With both, ESLint skips the rules oxlint already covers |
| Formatter | Prettier / oxfmt | |
| Testing | Vitest | |
| CSS Framework | Tailwind CSS / UnoCSS | |
| Git Hooks | Husky | Conventional Commits check, pre-commit lint and typecheck, pre-push tests |
| CI/CD | GitHub Actions | Optional GitHub Pages deployment with SPA fallback |
| Environment Variables | Framework built-in | dotenv for backend projects |
| Agent Docs | `AGENTS.md` / `CLAUDE.md` | Plus `docs/plan.md` and `docs/architecture.md` skeletons |

A `lynn` preset picks all of these in one step, matching the author's usual setup (ESLint and Prettier as linter and formatter). It defaults to Vue; combine it with `--framework react` to get the React equivalents:

```bash
pnpm create @clhuang224/web my-project --yes --framework react
```

Pass `--features` to pick an exact set instead, for example oxlint and oxfmt:

```bash
pnpm create @clhuang224/web my-project --yes --features oxlint,eslint,oxfmt,vitest,husky
```

## Development

Requires Node.js 22.18 or later and pnpm.

```bash
pnpm install
pnpm run build
node dist/cli.mjs --help
```

Checks:

```bash
pnpm run lint
pnpm run typecheck
pnpm run format:check
pnpm run test
```

## License

[MIT](./LICENSE)
