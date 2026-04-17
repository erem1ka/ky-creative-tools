# AGENTS.md

## 项目概览

本项目基于 `cf-web-artifacts` skill 构建。

- **前端**：Vite + React + TypeScript
- **UI**：TailwindCSS（无 UI 组件库）
- **路由**：React Router v6
- **部署**：快手内部 frontend-cloud

## 构建与启动命令

- 安装依赖：`npm install --registry https://npm.corp.kuaishou.com/`
- 启动开发服务器：`npm run dev`
- 构建产物：`npm run build`
- 部署：`npx -y @codeflicker/frontend-cloud-cli@latest deploy`

## 技术约束

- npm 源：`https://npm.corp.kuaishou.com/`
- 项目 ID：`image_tools`（无连字符）
- 部署平台：快手 frontend-cloud
- 内网访问控制：自动通过快手 SSO
