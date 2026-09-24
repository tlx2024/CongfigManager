# 贡献指南

感谢你参与 ConfigManager。欢迎提交问题报告、功能建议和 Pull Request。

## 开始开发

1. 安装 Node.js 22、Rust stable 和对应平台的 [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)。
2. 在仓库根目录运行 `npm ci` 与 `npm --prefix frontend ci`。
3. 运行 `npm run dev`，在应用中选择 `sample-workspace/config` 验证基本流程。

主要代码位于 `frontend/src/` 和 `src-tauri/src/`。项目站点位于 `docs/site/`，使用纯 HTML/CSS；Schema 示例位于 `sample-workspace/config/schemas/`。

## 提交更改

- 先在 Issue 中描述较大的功能变更，以便讨论交互和文件格式。
- 保持一次 Pull Request 聚焦一个问题，并写明实际行为、预期行为及验证步骤。
- 修改表单、保存、历史或 Schema 行为时，附上能复现的最小配置文件；请移除密钥和私人数据。
- 修改前端后运行 `npm run check`；修改 Rust 后在 `src-tauri/` 运行 `cargo test --locked`。
- UI 变更请附截图。项目站点可直接在浏览器中打开 `docs/site/index.html` 预览。

## 许可

提交到本仓库的代码按项目的 [AGPL-3.0-or-later](LICENSE) 许可分发。提交前请确认你有权贡献相关代码和资源。
