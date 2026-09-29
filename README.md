# Web Starter CLI

這是一個用來快速建立新的網頁應用程式專案的 CLI 工具。

靈感來自 vite 或 vue CLI，並搭配我自己開發專案常用的配置。

## Features

功能應該包含但不限於以下：

| 項目 | 選項 | 說明 |
| ---- | ---- | ---- |
| CI/CD | GitHub Actions / GitLab CI / Azure DevOps | 產生特定的 template |
| Linter | ESLint / OxLint |  |
| Formatter | Prettier |  |
| Testing | Vitest |  |
| SPA | Vue / React / Svelte / Angular | 根據不同的框架有不同的選項 |
| State Management | Pinia / Redux / NgRx | 根據不同的框架有不同的選項 |
| Routing | Vue Router / React Router / Angular Router / Svelte Navigator | 根據不同的框架有不同的選項 |
| CSS Framework | Tailwind CSS / UnoCSS |  |
| Build Tool | Vite | 根據不同的選項有不同的配置 |
| Git Hook | Husky |  |
| Package Manager | pnpm / bun | 根據不同的選項有不同的配置 |
| SVG Sprite | svg-sprite-loader |  |
| Commit Lint | Commitlint |  |
| Environment Variables | dotenv / 框架內建 |  |

## Usage

```bash
pnpm create @clhuang224/web my-project
```

或是全域安裝後使用：

```bash
volta install @clhuang224/create-web
create-web create my-project
create-web add <feature>
```
