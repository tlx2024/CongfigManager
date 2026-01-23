# 通用跨平台配置管理器（Tauri）

这是按文档 4.1（Tauri + 复用现有 React UI）新建的可执行应用骨架。

## 目录结构

- `apps/config-manager/src-tauri/`：Rust（本地文件扫描/备份/原子写）
- `apps/config-manager/frontend/`：独立前端（只做“编辑配置”），通过 Tauri commands 调用本地 Rust

## 约定的工作区结构（被 Rust 命令使用）

```text
<workspace-root>/
  config/
    <prefix>.json | <prefix>.xml
    history/
    schemas/
      <prefix>.schema.json
  schemas/
    <prefix>.schema.json
```

严格前缀匹配：两侧去掉扩展名后的 basename 必须完全相等。

本仓库内置一个可直接测试的工作区：`apps/config-manager/sample-workspace`。

## 已实现的 Tauri Commands（MVP：文件系统侧）

- `list_entries(workspace_root)`：扫描 `schemas/` 与 `config/`，按严格前缀匹配返回列表（排除 `config/history/`）
- `read_entry(workspace_root, prefix)`：读取 schema/config 原文（含 format）
- `save_entry_text(workspace_root, prefix, content)`：按原 config 文件路径写入文本；保存前先在 `config/history/` 备份；使用 tmp + replace 的原子写策略

## 开发运行（Windows）

1) 先确保你的环境满足 Tauri 依赖（Rust toolchain + WebView2 等）。

2) 安装依赖：

- 在 `apps/config-manager`：`npm install`
- 在 `apps/config-manager/frontend`：`npm install`

3) 启动：

- 在 `apps/config-manager` 下执行：`npm run dev`

该命令会：
- 自动在 `apps/config-manager/frontend` 启动 Vite（5174）
- 启动 Tauri Shell 并加载 `http://localhost:5174`

> 本前端已直接使用 Tauri commands（不依赖 `http://localhost:8200`）。

## 重要说明：为什么双击 debug exe 会“无法访问此页面”

你如果直接打开 `apps/config-manager/src-tauri/target/debug/config_manager.exe`，大概率会看到“嗯… 无法访问此页面”。

原因：这个 exe 通常来自 `tauri dev` 的开发构建，它会按 [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) 里的 `build.devUrl` 去加载前端页面（当前是 `http://localhost:5174`）。
当你没有同时运行 Vite 开发服务器时，它自然就加载失败。

这不代表“需要常驻后台服务才能发布”，而只是开发阶段的热更新模式。

## 打包为真正的独立可执行文件（不需要 Vite/后台）

在 `apps/config-manager` 下执行：

- `npm run build`

它会先构建前端到 `apps/config-manager/frontend/dist`，然后打包出可分发的安装包/可执行文件。

产物位置（以 Tauri 默认输出为准，实际以你机器为准）：
- 可直接运行的 release 二进制：`apps/config-manager/src-tauri/target/release/config_manager.exe`
- 安装包等 bundle：`apps/config-manager/src-tauri/target/release/bundle/`

打包后的应用会加载内置的 `frontend/dist`（`build.frontendDist`），因此**不需要**再启动 Vite，也不需要任何本地 HTTP 服务进程。

## 关于“单文件”与发布拷贝方式

- 开发目录里的 `src-tauri/target/**` 下会有很多编译中间产物（你截图里的“一串文件/文件夹”），**不要**把整个目录当成发布物拷贝到其它项目目录。
- 如果你想要“拷贝就能跑”的最小形态：通常只需要 `apps/config-manager/src-tauri/target/release/config_manager.exe`（以及系统已安装 WebView2 Runtime）。
- 更推荐的发布方式：使用 `apps/config-manager/src-tauri/target/release/bundle/` 下生成的安装包（例如 NSIS `.exe` / MSI），它本身就是一个单文件安装包，安装后不会把构建中间产物散落到你的项目目录。
