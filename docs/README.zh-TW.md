# create-web

[English](../README.md) | [繁體中文](./README.zh-TW.md)

一個有明確主張的 CLI，用來建立新的網頁專案，也能對既有專案加入新功能。

靈感來自 `create-vite` 與 `create-vue`，但它不只提供框架模板：Git hooks、CI、lint 與 format 規則、部署設定，以及給 AI agent 看的說明檔（`AGENTS.md` / `CLAUDE.md`）都會一起配置好，並且彼此搭配。

> [!WARNING]
> 這個專案還在早期開發階段。以下指令描述的是預計的使用方式，目前尚未實作。

## 使用方式

建立新專案：

```bash
pnpm create @clhuang224/web my-project
```

或是全域安裝，之後也能對既有專案加入功能：

```bash
volta install @clhuang224/create-web
create-web create my-project
create-web add <feature>
```

`add` 最適合用在由 `create-web` 建立的專案，這些專案會在 manifest 檔中記錄當初的選項。其他專案則盡力支援。

## 專案類型

| 類型 | 說明 |
| --- | --- |
| `frontend` | 以 Vite 建置的單頁應用程式 |
| `library` | 可發布到 npm 的 TypeScript 套件 |
| `backend` | API 伺服器 |
| `monorepo` | 在 `apps/*` 與 `packages/*` 下組合上述類型的 workspace |

會先完成 `frontend`，其他類型陸續加入。開發路線請見 [plan.md](./plan.md)。

## 選項

| 類別 | 選項 | 備註 |
| --- | --- | --- |
| 框架 | Vue / React | Svelte 與 Angular 規劃中 |
| 路由 | Vue Router / React Router | 依框架而定 |
| 狀態管理 | Pinia / Redux | 依框架而定 |
| 建置工具 | Vite | |
| 套件管理器 | pnpm / bun | hooks、CI 與 scripts 會跟著調整 |
| Linter | ESLint / oxlint / 兩者並用 | |
| Formatter | Prettier / oxfmt | |
| 測試 | Vitest | |
| CSS 框架 | Tailwind CSS / UnoCSS | |
| SVG Sprite | [`@clhuang224/vite-plugin-svg-sprite`](https://github.com/clhuang224/svg-sprite) | |
| Git Hooks | Husky | Conventional Commits 檢查、pre-commit 跑 lint 與 typecheck、pre-push 跑測試 |
| CI/CD | GitHub Actions | 可選擇部署到 GitHub Pages，並附 SPA fallback |
| 環境變數 | 框架內建 | backend 專案使用 dotenv |
| Agent 文件 | `AGENTS.md` / `CLAUDE.md` | 另附 `docs/plan.md` 與 `docs/architecture.md` 骨架 |

`lynn` preset 會一次選好上述所有項目，也就是作者平常慣用的配置。

## 開發

需要 Node.js 22.18 以上與 pnpm。

```bash
pnpm install
pnpm run build
node dist/cli.mjs --help
```

檢查：

```bash
pnpm run lint
pnpm run typecheck
pnpm run format:check
pnpm run test
```

## 授權

[MIT](../LICENSE)
