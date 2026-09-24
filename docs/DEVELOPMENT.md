# 开发说明

这份文档面向希望修改 ConfigManager 的开发者。第一次使用软件请先读[项目首页](../README.md)。

## 技术栈与目录

- `frontend/`：React 18、Vite、Ant Design 5；负责动态表单、源码编辑和 Schema 管理。
- `src-tauri/`：Tauri 2 与 Rust；负责目录扫描、读取、版本记录、备份和原子写入。
- `sample-workspace/`：供开发和界面预览使用的示例配置。
- `docs/site/`：静态介绍页源码；当前没有自动部署。

## 本地运行

需要 Node.js 22、Rust stable，以及 [Tauri 2 的平台依赖](https://v2.tauri.app/start/prerequisites/)。在仓库根目录执行：

```bash
npm ci
npm --prefix frontend ci
npm run dev
```

`npm run dev` 启动 Vite（端口 5174）和 Tauri 开发窗口。提交前可运行：

```bash
npm run check
cd src-tauri && cargo test --locked
```

`npm run check` 包含 TypeScript 类型检查、前端自检和生产构建。桌面安装包通过 `npm run build` 构建，输出位于 `src-tauri/target/release/bundle/`。根目录的 `package-lock.json` 锁定 Tauri CLI，`frontend/package-lock.json` 锁定前端依赖；两个锁文件都是 CI 中 `npm ci` 的输入。

## 工作区格式

应用接受一个配置目录，其下可直接放 `*.json`、`*.xml`；如果文件位于该目录的 `config/` 子目录，也会自动识别。常用目录结构如下：

```text
<配置目录>/
  algorithms.json
  schemas/
    algorithms.schema.json
  history/
  .meta/
```

`schemas/<文件名>.schema.json` 使用项目自定义的 **groups schema**，不是标准 JSON Schema。`groups[]` 定义分组，`fields[]` 定义字段；可描述字段类型、校验、条件展示及数组条目模板。参考[示例 Schema](../sample-workspace/config/schemas/algorithms.schema.json)。更详细的版本约定见 [Schema 与配置版本设计](plans/schema-config-versioning.md)。

保存配置时，后端先写入 `history/` 备份，再原子替换目标文件；配置版本信息写在 `.meta/`，不会插入用户的 JSON/XML 内容。Schema 历史与配置历史分别记录。

## 持续集成

[构建工作流](../.github/workflows/ci.yml) 在 Pull Request、`main` 推送和版本标签上执行检查。检查通过后生成 Windows、macOS、Linux 安装包并作为 Actions 制品上传。只有推送与应用版本一致的 `v*` 标签时，工作流才会发布 GitHub Release。
