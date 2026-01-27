# ConfigManager

ConfigManager 是一个现代化的配置管理系统，提供 **配置文件可视化编辑** 的完整解决方案。项目基于 **Tauri + React**，支持 **JSON / XML** 配置文件，并提供 **Schema 驱动的动态表单生成**，同时保留源码编辑能力，适用于桌面端配置维护、交付与回滚。

- 支持格式：JSON / XML
- 驱动方式：Schema（本项目自定义的“groups schema”）
- UI：动态表单 + 源码编辑双模式
- 存储安全：保存前自动备份（history），并使用原子写入策略

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
    <prefix>__YYYYMMDD_HHMMSS_mmm.<ext>
```

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

## 开发与运行（Windows）

### 前置条件

- Node.js（建议 18+）
- Rust toolchain（stable）
- Tauri 运行/构建依赖（Windows 通常需要 WebView2 Runtime、VS Build Tools 等）

> Tauri 的系统依赖会随平台变化；若你第一次使用 Tauri，建议先确认本机已满足官方环境要求。

### 安装依赖

在仓库根目录：

```bash
npm install
```

在前端目录：

```bash
npm --prefix frontend install
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
- `save_entry_text(workspaceRoot, prefix, content)`：保存文本（history 备份 + 原子写）
- `read_latest_history(workspaceRoot, prefix)`：读取最新备份
- `schema_setup_suggestion(workspaceRoot)`：判断是否应提示生成 schema
- `generate_default_schemas(workspaceRoot)`：为 JSON 配置生成/更新默认 schema
- `default_workspace_root()`：给出默认配置目录（发布时通常为 `<exe_dir>/config`）

## License

本项目使用 **GNU Affero General Public License v3.0 或更高版本（AGPL-3.0-or-later）**。

- 详见 [LICENSE](LICENSE)

