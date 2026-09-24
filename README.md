# ConfigManager

[![Desktop builds](https://github.com/tlx2024/CongfigManager/actions/workflows/ci.yml/badge.svg)](https://github.com/tlx2024/CongfigManager/actions/workflows/ci.yml) [![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](LICENSE)

ConfigManager 是一个开源桌面配置管理工具，基于 **Tauri 2 + React 18**。它支持 **JSON / XML** 配置文件、**Schema 驱动的动态表单**和源码编辑，适用于桌面端配置维护与回溯。

**[下载桌面应用](https://github.com/tlx2024/CongfigManager/releases) · [安装与使用](#下载与安装) · [项目站点](https://tlx2024.github.io/CongfigManager/) · [问题反馈](https://github.com/tlx2024/CongfigManager/issues)**

> 直接下载对应系统的安装包即可使用；无需安装 Node.js 或 Rust。项目站点只用于查看介绍和下载入口。

- 支持格式：JSON / XML
- 驱动方式：Schema（本项目自定义的“groups schema”）
- UI：动态表单 + 源码编辑双模式
- 存储安全：保存前自动备份（history），并使用原子写入策略

## 下载与安装

打开 [Releases 下载页](https://github.com/tlx2024/CongfigManager/releases)，按系统选择安装包：

| 系统 | 下载文件 | 使用方式 |
| --- | --- | --- |
| Windows x64 | `.exe` 安装程序或 `.msi` | 运行安装包，再打开 ConfigManager |
| macOS Apple Silicon / Intel | 对应架构的 `.dmg` | 打开 DMG，将应用拖入“应用程序” |
| Linux x64 | `.AppImage` 或 `.deb` | AppImage 授予执行权限后运行；Debian/Ubuntu 可安装 DEB |

首次启动时，应用会为当前用户准备可写的示例配置目录。也可以点击“浏览…”选择自己的 JSON/XML 配置目录，再点击“加载”。选中配置后使用“表单”或“源码”编辑，保存前会自动备份旧版本。

当前 macOS 包使用临时签名，未进行 Apple 公证；首次打开如被系统拦截，需要在“隐私与安全性”中允许。安装包尚未发布时，可以在 [Actions 构建记录](https://github.com/tlx2024/CongfigManager/actions/workflows/ci.yml)中下载临时构建产物。

## 功能特性

- **配置目录扫描与条目匹配**：扫描配置目录下的 `*.json` / `*.xml`，按前缀（basename）识别条目
- **Schema 驱动表单**：根据 schema 渲染动态表单，支持分组、数组项模板、对象嵌套、字段校验、条件展示等
- **无 Schema 也可用**：
  - 若缺少 schema：前端会基于当前配置内容 **自动推导** 表单结构作为兜底
  - 对 JSON：可一键 **生成默认 schema**（仅覆盖“自动生成”的 schema，不覆盖手写 schema）
- **双编辑模式**：
  - 表单模式：面向业务人员、减少出错
  - 源码模式：面向工程人员，直接编辑原始文本
- **历史版本与恢复**：每次保存前会在 `history/` 生成备份；支持“一键加载最新备份到编辑区”（不会自动写回磁盘，需再次点击保存）
- **Schema 管理**：顶栏「Schema 管理」可新建/编辑/删除 schema
  - 结构模式：分组与字段的增删改、上移下移、数组条目模板
  - 源码模式：直接编辑 schema JSON（非法 JSON 会阻止保存）
  - 预览模式：用真实表单渲染器预览效果
  - 每次保存 `schemaVersion` 自动 +1，旧版本归档到 `history/`，可加载回编辑区
- **安全性**：后端对文件路径做 workspace 边界校验，避免越权读写

## 技术栈

- Tauri v2（Rust 后端 + WebView 前端容器）
- Rust 2021
- React 18 + Vite
- Ant Design 5
- XML：fast-xml-parser

## 仓库结构

- [frontend/](frontend/)：React 前端（动态表单、源码编辑、目录选择、调用 Tauri commands）
- [src-tauri/](src-tauri/)：Rust 后端（扫描、读取、备份、原子写入、schema 生成）
- [sample-workspace/](sample-workspace/)：示例工作区（用于快速验证）

## 工作区（Workspace）约定

应用需要一个“配置目录”（在 UI 里叫 `workspaceRoot`）。该目录通常 **直接包含**配置文件：

```text
<workspaceRoot>/
  *.json | *.xml
  schemas/
    <prefix>.schema.json
  history/
    <prefix>_YYYYMMDD_HHMMSS_mmm.<ext>
    <prefix>.index.json        # 版本清单（备注/作者/schema 版本）
    <prefix>.schema_YYYYMMDD_HHMMSS_mmm.json
    <prefix>.schema.index.json # schema 的版本清单（与配置的历史互不干扰）
  .meta/
    <prefix>.meta.json         # 配置版本、所依据的 schema 版本、内容哈希
```

版本化说明见 [docs/plans/schema-config-versioning.md](docs/plans/schema-config-versioning.md)：

- schema 版本写在 schema 文件顶层 `schemaVersion`（整数，缺省 1）；重新生成默认 schema 会自动 +1
- 配置版本写在 `.meta/<prefix>.meta.json`，**不写进配置文件本身**（避免影响外部消费程序）
- 打开条目时若 schema 版本与配置记录的版本不一致，会在顶部给出提示；升级不会静默改写磁盘
- `history/<prefix>.index.json` 只是备注载体，丢失时按 history 目录扫描重建
- schema 每保存一次 `schemaVersion` +1，旧文件归档为 `history/<prefix>.schema_<ts>.json`；schema 升版不会改写任何配置文件

命名约定：

- 配置文件：`<prefix>.json` 或 `<prefix>.xml`
- schema 文件：`schemas/<prefix>.schema.json`
- 前缀严格匹配：`<prefix>` 必须与配置文件 basename 完全一致

兼容规则（便于接入已有项目目录）：

- 如果你在 `workspaceRoot` 下没有直接放 `*.json/*.xml`，但在 `workspaceRoot/config/` 下有配置文件，后端会自动回退到 `workspaceRoot/config/` 作为实际配置目录。

示例（仓库内置）：

- 配置文件：[sample-workspace/config/algorithms.json](sample-workspace/config/algorithms.json)
- schema 示例：[sample-workspace/config/schemas/algorithms.schema.json](sample-workspace/config/schemas/algorithms.schema.json)

## Schema 说明（groups schema）

本项目使用“分组（groups）”模型来描述表单布局，不是标准 JSON Schema。

核心概念：

- `groups[]`：表单分组（可折叠、可用 tabs/collapse/card 呈现）
- `fields[]`：字段定义（string/number/boolean/array/object 等）
- `group.type = array`：数组分组，支持 `ui.itemTemplate` 描述每一项的字段/子分组
- `field.validation`：常见校验（required、min/max、minLength/maxLength、pattern、enum）
- `field.dependsOn`：条件展示（基于另一个字段的值进行显示/隐藏）

推荐从示例 schema 入手理解格式：

- [sample-workspace/config/schemas/algorithms.schema.json](sample-workspace/config/schemas/algorithms.schema.json)

## 开发与运行

### 前置条件

- Node.js 22
- Rust toolchain（stable）
- [Tauri 2 对应平台的系统依赖](https://v2.tauri.app/start/prerequisites/)

> Tauri 的系统依赖会随平台变化；若你第一次使用 Tauri，建议先确认本机已满足官方环境要求。

### 安装依赖

在仓库根目录：

```bash
npm ci
```

在前端目录：

```bash
npm --prefix frontend ci
```

### 启动开发模式

```bash
npm run dev
```

该命令会：

- 先启动 `frontend` 的 Vite 开发服务器（端口 5174）
- 再启动 Tauri 开发壳并加载 `http://localhost:5174`

### 打包构建

```bash
npm run build
```

构建会先输出 `frontend/dist`，然后由 Tauri 打包生成可分发产物（默认位于 `src-tauri/target/release/bundle/`）。

### 提交前检查

```bash
npm run check
cd src-tauri && cargo test --locked
```

`npm run check` 执行 TypeScript 类型检查、前端自检和生产构建。CI 在 Pull Request 与 `main` 推送时生成 Windows、macOS、Linux 安装包并上传为 Actions 构建产物；推送与应用版本一致的 `v*` 标签后，所有平台构建通过才会发布到 GitHub Releases。

维护者的版本发布步骤见 [docs/RELEASING.md](docs/RELEASING.md)。

## 使用指南

1. 启动应用
2. 在顶部输入框中填写配置目录（`workspaceRoot`），或点击“浏览…”选择目录
3. 点击“加载”，左侧将出现识别到的配置条目
4. 选择条目后：
   - 通过“表单”页编辑（有 schema 时使用 schema；无 schema 时尝试推导）
   - 或切换到“源码”页直接编辑文本
5. 点击“保存”：
   - 保存前会在 `history/` 写入备份
   - 写入采用原子替换策略（tmp + replace）

### 生成/更新默认 schema（JSON）

- 当检测到 schema 缺失且存在 JSON 配置时，应用会提示是否生成默认 schema
- 也可点击“更新默认 schema”批量生成/更新

注意：仅会覆盖“自动生成”的 schema（`createdBy=config-manager` 且描述以“自动生成”开头），不会覆盖手写 schema。

## 后端命令（Tauri Commands）

前端通过 `@tauri-apps/api` 调用以下命令：

- `list_entries(workspaceRoot)`：扫描条目（配置存在即可列出；schema 可缺省）
- `read_entry(workspaceRoot, prefix)`：读取 schema/config 原文
- `save_entry_text(workspaceRoot, prefix, content, note?)`：保存文本（history 备份 + 原子写 + 版本号递增）
- `read_entry_meta(workspaceRoot, prefix)`：读取版本状态（配置版本/schema 版本/是否被外部修改）
- `list_history(workspaceRoot, prefix)`：列出历史版本（含备注、作者、schema 版本）
- `read_history_file(workspaceRoot, prefix, file)`：读取指定历史版本内容
- `read_latest_history(workspaceRoot, prefix)`：读取最新备份
- `schema_setup_suggestion(workspaceRoot)`：判断是否应提示生成 schema
- `generate_default_schemas(workspaceRoot)`：为 JSON 配置生成/更新默认 schema
- `default_workspace_root()`：给出当前用户的可写配置目录，并在首次启动时复制内置示例
- `list_schemas(workspaceRoot)` / `read_schema(workspaceRoot, prefix)`：列出/读取 schema
- `save_schema(workspaceRoot, prefix, text, note?)`：保存 schema（校验 JSON + 备份 + `schemaVersion` +1）
- `delete_schema(workspaceRoot, prefix)`：删除 schema（删除前先备份）
- `list_schema_history(workspaceRoot, prefix)` / `read_schema_history_file(workspaceRoot, prefix, file)`：schema 历史版本
- `create_entry(workspaceRoot, prefix, format, content)`：按 schema 默认值创建新配置（已存在则报错，不覆盖）

## License

本项目使用 **GNU Affero General Public License v3.0 或更高版本（AGPL-3.0-or-later）**。

- 详见 [LICENSE](LICENSE)

## 参与贡献

欢迎通过 [Issues](https://github.com/tlx2024/CongfigManager/issues) 反馈问题与建议，或按 [CONTRIBUTING.md](CONTRIBUTING.md) 提交 Pull Request。

项目站点源码在 [docs/site/](docs/site/)；推送到 `main` 后由 [Pages 工作流](.github/workflows/pages.yml) 发布。仓库管理员需要先在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
