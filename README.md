# create-web

[English](./README.md) | [繁體中文](./docs/README.zh-TW.md)

An opinionated CLI for scaffolding web projects, and for adding features to projects you already have.

Inspired by `create-vite` and `create-vue`, but it sets up more than a framework template: Git hooks, CI, lint and format rules, deployment, and agent instruction files (`AGENTS.md` / `CLAUDE.md`) all come preconfigured and work together.

> [!WARNING]
> This project is in early development and not published to npm yet. Frontend (Vue, React), library, and monorepo projects are supported so far.

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
create-web remove <feature>
```

`remove` undoes what a feature added, such as switching from Prettier to oxfmt (`create-web remove prettier`, then `create-web add oxfmt`). Files and scripts you changed since are kept and listed. Tooling features (linters, formatters, Vitest, Git hooks, CI, deployment, docs) can be removed; framework features (routers, state management, Tailwind) cannot yet.

`add` currently works on projects created by `create-web`, which record their choices in `.create-web.json`.

Some generated files (Git hooks, the CI workflow, `AGENTS.md`) contain blocks between `create-web:start` and `create-web:end` comments. `create-web` keeps those blocks in sync with your scripts whenever you add a feature, so put your own changes outside them.

## Project Kinds

| Kind | Description |
| --- | --- |
| `frontend` | Single-page app built with Vite |
| `library` | TypeScript package ready to publish to npm |
| `backend` | API server |
| `monorepo` | Workspace that combines the kinds above under `apps/*` and `packages/*` |

`frontend`, `library`, and `monorepo` are available; `backend` is planned. See [docs/plan.md](./docs/plan.md) for the roadmap.

Create a library with a scoped package name:

```bash
pnpm create @clhuang224/web my-lib --kind library --name @my-scope/my-lib
```

Libraries are built with [tsdown](https://tsdown.dev) into ESM with type declarations. The optional `publish` feature adds a workflow that publishes to npm when a `v*` tag is pushed.

### Monorepos

A monorepo keeps shared tooling (formatter, Git hooks, CI, agent docs) at the root and puts apps under `apps/*` and packages under `packages/*`. Each project has its own linter and tests, and its own `.create-web.json`, so `create-web add` works inside it too.

```bash
# apps/web (Vue) and packages/shared (library) by default
pnpm create @clhuang224/web my-repo --kind monorepo

# or pick the projects
pnpm create @clhuang224/web my-repo --kind monorepo --members web:react,shared:library

# later, from the monorepo root
create-web add-member admin --type vue
```

Projects are named after the root, e.g. `@my-repo/web`. GitHub Pages deployment and the publish workflow are not available inside a monorepo yet.

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
| CSS Framework | Tailwind CSS | |
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
