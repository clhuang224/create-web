# create-web

[English](./README.md) | [繁體中文](./docs/README.zh-TW.md)

An opinionated CLI for scaffolding web projects, and for adding features to projects you already have.

Inspired by `create-vite` and `create-vue`, but it sets up more than a framework template: Git hooks, CI, lint and format rules, deployment, and agent instruction files (`AGENTS.md` / `CLAUDE.md`) all come preconfigured and work together.

> [!WARNING]
> This project is in early development. The commands below describe the intended interface and are not implemented yet.

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

`add` works best on projects created by `create-web`, which record their choices in a manifest file. Other projects are supported on a best-effort basis.

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
| State Management | Pinia / Redux | Depends on the framework |
| Build Tool | Vite | |
| Package Manager | pnpm / bun | Hooks, CI and scripts adapt to the choice |
| Linter | ESLint / oxlint / both | |
| Formatter | Prettier / oxfmt | |
| Testing | Vitest | |
| CSS Framework | Tailwind CSS / UnoCSS | |
| SVG Sprite | [`@clhuang224/vite-plugin-svg-sprite`](https://github.com/clhuang224/svg-sprite) | |
| Git Hooks | Husky | Conventional Commits check, pre-commit lint and typecheck, pre-push tests |
| CI/CD | GitHub Actions | Optional GitHub Pages deployment with SPA fallback |
| Environment Variables | Framework built-in | dotenv for backend projects |
| Agent Docs | `AGENTS.md` / `CLAUDE.md` | Plus `docs/plan.md` and `docs/architecture.md` skeletons |

A `lynn` preset picks all of these in one step, matching the author's usual setup.

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
