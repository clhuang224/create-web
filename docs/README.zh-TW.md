# create-web

[English](../README.md) | [繁體中文](./README.zh-TW.md)

一個有明確主張的 CLI，用來建立新的網頁專案，也能對既有專案加入新功能。

靈感來自 `create-vite` 與 `create-vue`，但它不只提供框架模板：Git hooks、CI、lint 與 format 規則、部署設定，以及給 AI agent 看的說明檔（`AGENTS.md` / `CLAUDE.md`）都會一起配置好，並且彼此搭配。

> [!WARNING]
> 這個專案還在早期開發階段，尚未發布到 npm。目前支援前端（Vue、React）、library 與 monorepo 專案。

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
create-web remove <feature>
```

`remove` 會撤銷某個功能加入的內容，例如把 Prettier 換成 oxfmt（先 `create-web remove prettier`，再 `create-web add oxfmt`）。你之後改過的檔案和 scripts 會保留並列出。目前可以移除工具類的功能（linter、formatter、Vitest、Git hooks、CI、部署、文件），框架類的功能（路由、狀態管理、Tailwind）還不行。

`add` 目前只支援由 `create-web` 建立的專案，這些專案會在 `.create-web.json` 中記錄當初的選項。

部分產生的檔案（Git hooks、CI workflow、`AGENTS.md`）中有用 `create-web:start` 與 `create-web:end` 註解包起來的區塊。每次加入功能時，`create-web` 都會依照目前的 scripts 更新這些區塊，所以你自己的修改請寫在區塊外面。

## 專案類型

| 類型 | 說明 |
| --- | --- |
| `frontend` | 以 Vite 建置的單頁應用程式 |
| `library` | 可發布到 npm 的 TypeScript 套件 |
| `backend` | API 伺服器 |
| `monorepo` | 在 `apps/*` 與 `packages/*` 下組合上述類型的 workspace |

目前可以使用 `frontend`、`library` 與 `monorepo`，`backend` 規劃中。開發路線請見 [plan.md](./plan.md)。

建立一個 scoped 套件名稱的 library：

```bash
pnpm create @clhuang224/web my-lib --kind library --name @my-scope/my-lib
```

Library 會用 [tsdown](https://tsdown.dev) 打包成附型別宣告的 ESM。可選的 `publish` 功能會加入一個 workflow，在推送 `v*` tag 時發布到 npm。

### Monorepo

Monorepo 會把共用的工具（formatter、Git hooks、CI、agent 文件）放在根目錄，app 放在 `apps/*`，套件放在 `packages/*`。每個專案有自己的 linter、測試和 `.create-web.json`，所以在專案資料夾裡也能使用 `create-web add`。

```bash
# 預設建立 apps/web（Vue）與 packages/shared（library）
pnpm create @clhuang224/web my-repo --kind monorepo

# 或是指定要建立的專案
pnpm create @clhuang224/web my-repo --kind monorepo --members web:react,shared:library

# 之後在 monorepo 根目錄新增專案
create-web add-member admin --type vue
```

各專案會以根目錄名稱作為 scope，例如 `@my-repo/web`，而且名稱在 workspace 內不能重複（根目錄會忽略的名稱，例如 `dist`、`node_modules`，也不能使用）。在根目錄加入或移除功能（例如更換 formatter）時，也會一併更新各專案產生的設定檔。Monorepo 內目前還不支援 GitHub Pages 部署與 publish workflow。

## 選項

| 類別 | 選項 | 備註 |
| --- | --- | --- |
| 框架 | Vue / React | Svelte 與 Angular 規劃中 |
| 路由 | Vue Router / React Router | 依框架而定 |
| 狀態管理 | Pinia / Redux Toolkit | 依框架而定 |
| 建置工具 | Vite | |
| 套件管理器 | pnpm / bun | hooks、CI 與 scripts 會跟著調整 |
| Linter | ESLint / oxlint / 兩者並用 | 兩者並用時，ESLint 會略過 oxlint 已經檢查的規則 |
| Formatter | Prettier / oxfmt | |
| 測試 | Vitest | |
| CSS 框架 | Tailwind CSS | |
| Git Hooks | Husky | Conventional Commits 檢查、pre-commit 跑 lint 與 typecheck、pre-push 跑測試 |
| CI/CD | GitHub Actions | 可選擇部署到 GitHub Pages，並附 SPA fallback |
| 環境變數 | 框架內建 | backend 專案使用 dotenv |
| Agent 文件 | `AGENTS.md` / `CLAUDE.md` | 另附 `docs/plan.md` 與 `docs/architecture.md` 骨架 |

`lynn` preset 會一次選好上述所有項目，也就是作者平常慣用的配置（linter 與 formatter 用 ESLint 和 Prettier）。預設是 Vue，搭配 `--framework react` 就會換成對應的 React 選項：

```bash
pnpm create @clhuang224/web my-project --yes --framework react
```

也可以用 `--features` 指定確切的功能組合，例如改用 oxlint 與 oxfmt：

```bash
pnpm create @clhuang224/web my-project --yes --features oxlint,eslint,oxfmt,vitest,husky
```

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
