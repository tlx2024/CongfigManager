# ConfigManager - 统一配置管理系统

<div align="center">

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/tlx2024/CongfigManager/releases/tag/v0.1.0)
[![Tauri](https://img.shields.io/badge/Tauri-2.0+-24C8D8.svg?logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584.svg?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![CI Build](https://github.com/tlx2024/CongfigManager/actions/workflows/ci.yml/badge.svg)](https://github.com/tlx2024/CongfigManager/actions/workflows/ci.yml)
[![GitHub Pages](https://img.shields.io/badge/docs-GitHub%20Pages-orange.svg)](https://tlx2024.github.io/CongfigManager/)

**高性能、跨平台的 JSON / XML 配置文件可视化管理与安全版本控制桌面工作站**

[快速开始](#-快速开始) · [下载中心](#-下载与安装) · [功能特性](#-功能特性) · [界面预览](#-界面预览) · [架构设计](#-架构设计) · [规范与示例](#-工作区与-schema-规范) · [开发与构建](#-开发与构建) · [参与贡献](#-参与贡献)

</div>

---

## 📖 项目简介

**ConfigManager** 是一款专为工程研发、算法调优、自动化系统及多环境部署打造的现代化跨平台配置管理桌面应用。

在复杂的项目工程中，配置文件往往四散各处、格式繁多。手动使用文本编辑器修改 JSON 或 XML 容易产生语法错误、漏填必要参数，且缺乏历史版本追踪与快速回滚机制。ConfigManager 基于 **Tauri 2 + Rust + React 18** 架构构建，用户只需选定本地配置目录，即可在统一的操作界面中实现配置集中管理、表单与源码双向同步编辑、Schema 驱动的智能校验，以及保存前的安全快照备份与双轨版本控制。

### 🎯 适用场景

- ✅ **算法与系统参数调优**：计算机视觉、机器人控制、AI 推理插件等复杂参数的可视化表单调节。
- ✅ **应用程序与服务配置维护**：桌面客户端、嵌入式应用、微服务本地配置的集中化浏览与安全编辑。
- ✅ **配置防呆与团队规范约束**：基于 Schema 设定取值范围、枚举选项、正则格式与必填约束，杜绝人为手写配置失误。
- ✅ **配置版本追溯与一键回滚**：生产与实验场景下关键配置的修改快照归档，出现异常时可快速回滚至任意历史版本。
- ✅ **涉密与高安全离线环境**：100% 纯本地运行与文件 IO，零网络中转、零远程遥测，保障企业和科研核心数据绝对安全。

### ⚡ 核心优势

| 特性维度 | 说明 |
|----------|------|
| 🚀 **极速轻量** | 采用 Tauri 2 + Rust 原生核心，毫秒级快速冷启动，内存与 CPU 资源占用远低于传统 Electron 应用 |
| 📝 **双视图编辑** | 提供结构化表单视图（防呆交互、直观可读）与纯文本源码视图（精细控制、完整展示），两者无缝同步 |
| 📋 **Schema 驱动** | 基于针对表单优化的 Groups Schema 体系，支持分组分栏、字段范围校验、条件联动展示与动态数组 |
| 🪄 **智能逆向推导** | 无需提前手写 Schema，系统可自动从现有 JSON/XML 配置文件推导出表单结构，并可一键生成规范 Schema |
| 🎨 **可视化设计器** | 内置独立的 Schema 设计工作台，拖拽与交互式编排字段属性与校验规则，所见即所得实时预览表单 |
| 🛡️ **双轨版本控制** | 配置文件与 Schema 文件独立版本追踪；保存前强制生成历史快照，支持无损加载比对与安全恢复 |
| 🔒 **非侵入式元数据** | 版本号与变更元信息独立存放于 `.meta/` 目录，绝不篡改或在原始 JSON/XML 中注入非标准字段 |
| 💻 **跨平台免依赖** | 原生覆盖 Windows x64、macOS (Apple Silicon & Intel) 以及主流 Linux 发行版，终端用户无需安装 Node/Rust |

---

## 📦 下载与安装

ConfigManager 预编译客户端由 GitHub Actions 多平台矩阵自动化构建并发布。终端用户**无需准备开发环境或安装运行时**，直接下载对应平台的安装包即可。

> **当前正式版本：[`v0.1.0`](https://github.com/tlx2024/CongfigManager/releases/tag/v0.1.0)**
> 所有安装包已与 GitHub Releases 官方发布资产直接对齐。

| 操作系统 | 硬件架构 | 安装包类型 | 安装包说明 | 官方直达下载链接 (v0.1.0) |
|---|---|---|---|---|
| **Windows** | x64 (64位) | NSIS 安装程序 (`.exe`) | **推荐**，双击一键引导安装 | [⬇️ 下载 EXE 安装包](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_x64-setup.exe) |
| **Windows** | x64 (64位) | Windows Installer (`.msi`) | 企业环境静默部署与组策略分发 | [⬇️ 下载 MSI 安装包](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_x64_en-US.msi) |
| **macOS** | Apple Silicon | DMG 镜像 (`.dmg`) | 适配 M1 / M2 / M3 / M4 芯片 Mac | [⬇️ 下载 ARM64 DMG](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_aarch64.dmg) |
| **macOS** | Intel x64 | DMG 镜像 (`.dmg`) | 适配 Intel 架构 Mac 电脑 | [⬇️ 下载 Intel DMG](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_x64.dmg) |
| **Linux** | x64 (amd64) | AppImage (`.AppImage`) | **推荐**，独立免安装单文件，通用所有发行版 | [⬇️ 下载 AppImage](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_amd64.AppImage) |
| **Linux** | x64 (amd64) | Debian 软件包 (`.deb`) | 适配 Ubuntu、Debian 等衍生系统 | [⬇️ 下载 DEB 安装包](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_amd64.deb) |

*也可以访问 [GitHub Releases 页面](https://github.com/tlx2024/CongfigManager/releases) 或 [GitHub Pages 下载主页](https://tlx2024.github.io/CongfigManager/#download) 查看版本发布日志。*

### 💡 平台使用贴士

- **macOS 用户**：
  当前构建使用临时签名，未进行 Apple 公证。首次打开若弹出“无法打开，因为无法验证开发者”或“应用已损坏”警告，请前往系统 **「系统设置」→「隐私与安全性」** 中点击 **「仍要打开」**；或在终端中运行以下命令解除隔离属性：
  ```bash
  sudo xattr -cr /Applications/Config\ Manager.app
  ```
- **Linux 用户**：
  下载 `.AppImage` 文件后，添加可执行权限即可直接运行：
  ```bash
  chmod +x ConfigReader.Config.Manager_0.1.0_amd64.AppImage
  ./ConfigReader.Config.Manager_0.1.0_amd64.AppImage
  ```
  若使用 `.deb` 包，通过 `sudo dpkg -i ConfigReader.Config.Manager_0.1.0_amd64.deb` 安装。

---

## 🚀 快速开始

只需简单四步，即可开始安全管理你的配置文件：

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  1. 启动应用     │ ──> │  2. 载入工作区   │ ──> │  3. 表单/源码修改 │ ──> │  4. 备份与安全保存│
│  下载安装即开即用 │     │  选择配置本地目录 │     │  实时校验防呆防错 │     │  历史快照原子写入│
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
```

1. **启动程序**：首次打开应用时，系统已自动内置一套可交互的算法示例工作区（含 `algorithms.json` 与匹配 Schema），方便你即刻体验各项功能。
2. **选择工作区**：点击顶部「浏览…」选择你实际项目的配置目录，再点击「加载」。配置文件可直接放在该根目录下，或放在其子目录 `config/` 下（支持 `*.json` 与 `*.xml` 格式）。
3. **可视化编辑**：在左侧列表中点击选择配置文件：
   - 切换到「**表单**」标签：以结构化卡片、滑块、开关、下拉菜单的形式修改参数，享受即时范围校验与动态联动保护；
   - 切换到「**源码**」标签：查看或精确微调底层原始文本，适合批量文本粘贴与底层结构核验。
4. **安全保存与回滚**：确认修改后点击「保存配置」。后端在覆写前会自动将原版本快照备份至 `history/` 并递增版本。若后续需要找回旧参数，在「历史」标签中可随时载入任意历史版本，核对无误后再决定保存恢复。

---

## 🖥️ 界面预览

以下界面截图均基于 ConfigManager 运行真实项目内置示例截取：

### 1. 结构化表单编辑界面
*根据 Schema 分组渲染输入控件，支持数值范围限制、开关控件、联动条件展示与数组条目管理：*
![表单编辑示例配置](docs/screenshots/main-form.png)

### 2. 原生源码编辑视图
*提供完整的代码查看与编辑环境，保留文本缩进与语法格式，适合高精细修改：*
![源码编辑示例配置](docs/screenshots/source-editor.png)

### 3. 可视化 Schema 设计工作室
*无需手写复杂 JSON，以可视化交互定义字段属性、校验规则、默认值与分组布局，并支持表单实时渲染预览：*
![Schema 结构编辑界面](docs/screenshots/schema-editor.png)

---

## ✨ 功能特性

### 1️⃣ 双视图协同编辑 (Form & Source Dual View)

- **动态智能表单**：根据配置类型与 Schema 规范自动渲染表单控件，涵盖字符串输入框、数值微调器/滑动条、布尔开关、枚举单选/下拉框、颜色选择器以及动态可增删的嵌套数组结构。
- **源码模式直接控制**：随时切换到源码编辑视图，实时查阅原汁原味的 JSON 或 XML 文本。
- **编辑区无损隔离**：在前端编辑区的所有临时改动均保存在内存中，只有显式点击「保存配置」时才会持久化，避免误编辑导致原文件受损。

### 2️⃣ Schema 驱动与智能逆向推导 (Schema Engine)

- **零门槛开箱即用**：即使你的项目只有原始配置文件、完全没有编写过 Schema，ConfigManager 也会在载入时自动分析数据结构，逆向推导出一套默认的动态表单，保证即开即改。
- **一键生成标准 Schema**：检测到缺少 Schema 时，系统提供一键生成功能，自动提取字段层级并在 `schemas/` 下创建基础 Schema，已有手写 Schema 受到绝对保护，绝不强制覆盖。
- **Groups Schema 规范体系**：采用面向现代化表单呈现设计的 Groups 规范，提供比传统标准 JSON Schema 更加友好直观的分组布局（`groups`）、字段展示条件（`conditions`）和交互控制。

### 3️⃣ 内置 Schema 可视化设计工作室 (Schema Studio)

- **纯图形化编排**：左侧统一管理工作区内所有 Schema 文件，右侧提供分组创建、字段增删、类型调整、必填与范围规则设定的可视化工作流。
- **即时交互式预览**：设计 Schema 的同时，右侧控制台实时渲染生成的最终动态表单，可直接测试交互逻辑与联动条件是否符合预期。
- **独立版本历史**：Schema 文件本身也享有独立的版本追踪与历史备份机制，避免多人协作时表单定义被误改。

### 4️⃣ 双轨版本控制与安全写入保护 (Safe Versioning & Atomic Write)

- **自动快照备份**：每一次点击保存，后端 Rust 引擎首先将当前磁盘上的文件按时间戳和版本号完整备份到 `history/` 目录下。
- **独立元数据管理**：版本号、最后更新人、更新时间戳与配置哈希记录在独立的 `.meta/` 目录中，确保输出的业务配置文件保持纯粹干净，绝无第三方注释或脏属性。
- **原子替换写入 (Atomic Write)**：底层保存采用临时文件写入校验成功后再进行文件原子重命名（Atomic Rename）策略，即使遭遇系统崩溃、意外断电，也能杜绝文件写入中断导致的配置损坏。
- **路径遍历安全防御**：Rust 后端严格校验所有文件读写前缀与相对路径，有效抵御跨目录非法访问风险。

---

## 📐 架构设计

### 1. 系统总体架构

```
┌────────────────────────────────────────────────────────────────────────┐
│                         ConfigManager Desktop                          │
├────────────────────────────────────────────────────────────────────────┤
│  前端展示层 (React 18 + TypeScript + Ant Design 5 + Vite)                │
│  ├── 动态表单引擎 (DynamicForm)       ── 表单渲染、控件交互、条件联动     │
│  ├── 源码编辑模块 (SourceEditor)      ── 语法高亮、文本校验、双向同步     │
│  ├── Schema 设计器 (SchemaEditor)    ── 可视化字段编排、实时效果预览     │
│  └── 差异对比与历史 (Diff & History)   ── 快照对比、版本回滚、审计记录     │
├────────────────────────────────────────────────────────────────────────┤
│  IPC 通信网桥 (@tauri-apps/api/core)                                   │
├────────────────────────────────────────────────────────────────────────┤
│  原生核心层 (Tauri 2 + Rust Core)                                      │
│  ├── 工作区与文件扫描器              ── 智能探测 JSON/XML 与 config 目录 │
│  ├── 安全读写引擎 (Safe IO Engine)    ── 原子写入 (tempfile)、路径穿越防御│
│  ├── Schema 逆向推导引擎             ── 从配置数据自动推断结构生成 Schema│
│  ├── 版本与元数据管理 (.meta)         ── 配置与 Schema 双轨独立版本记录   │
│  └── 历史快照归档服务 (history/)     ── 自动生成带时间戳快照与回滚服务   │
└────────────────────────────────────────────────────────────────────────┘
```

### 2. 工作区文件结构规范

ConfigManager 遵循清晰、非侵入式的文件组织约定。一个标准配置工作区目录结构如下：

```text
workspace_root/                   # 工作区根目录（或放置于 config/ 子目录下）
├── algorithms.json               # 业务配置文件 (JSON 格式)
├── device_settings.xml           # 业务配置文件 (XML 格式)
│
├── schemas/                      # 对应的 Schema 规则定义目录
│   ├── algorithms.schema.json    # algorithms.json 对应的自定义 Groups Schema
│   └── device_settings.schema.json
│
├── history/                      # 变更历史快照归档（保存时自动生成）
│   ├── algorithms.json.1737600000.bak
│   └── algorithms.schema.json.1737600000.bak
│
└── .meta/                        # 内部独立版本元数据（不修改业务配置文件本身）
    ├── algorithms.json.meta.json
    └── algorithms.schema.json.meta.json
```

### 3. 技术栈清单

| 分层 | 技术 / 库 | 用途与定位 |
|---|---|---|
| **桌面底座** | [Tauri 2.0](https://tauri.app/) | 轻量化、高安全性的跨平台桌面运行环境与原生沙箱 |
| **底层核心** | [Rust 1.75+](https://www.rust-lang.org/) | 高性能文件 IO、原子操作、路径安全校验与强类型解析 |
| **前端框架** | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | 组件化视图架构、类型安全与可靠的状态管理 |
| **UI 设计系统** | [Ant Design 5](https://ant.design/) | 现代化企业级组件库，驱动表单交互、抽屉与布局 |
| **构建工具** | [Vite 5](https://vitejs.dev/) | 极速前端热重载开发服务器与 Rollup 打包引擎 |
| **格式处理** | `serde_json` + `quick-xml` | 高性能流式 JSON 与 XML 序列化/反序列化 |
| **持续集成** | GitHub Actions | 跨平台自动化矩阵构建 (Windows/macOS/Linux) 与自动发布 |

---

## 🌟 工作区与 Schema 规范

### 示例 1: 业务配置文件 (`algorithms.json`)

```json
{
  "algorithm": {
    "name": "CircleDetection",
    "enabled": true,
    "minRadius": 10,
    "maxRadius": 100,
    "sensitivity": 0.85,
    "modelPath": "./models/circle_v2.onnx"
  }
}
```

### 示例 2: 对应的 Groups Schema 定义 (`schemas/algorithms.schema.json`)

```json
{
  "name": "圆形检测算法配置",
  "description": "定义圆形检测算法的关键超参数与模型路径",
  "groups": [
    {
      "id": "basic",
      "title": "基础参数",
      "description": "算法启停与基础信息",
      "fields": [
        {
          "key": "algorithm.name",
          "label": "算法标识",
          "type": "string",
          "required": true,
          "description": "算法唯一名称标识"
        },
        {
          "key": "algorithm.enabled",
          "label": "启用算法",
          "type": "boolean",
          "defaultValue": true
        }
      ]
    },
    {
      "id": "detection",
      "title": "检测阈值控制",
      "description": "仅在算法处于启用状态时调节",
      "conditions": [
        {
          "field": "algorithm.enabled",
          "operator": "==",
          "value": true
        }
      ],
      "fields": [
        {
          "key": "algorithm.minRadius",
          "label": "最小检测半径 (px)",
          "type": "number",
          "validation": { "min": 1, "max": 500 }
        },
        {
          "key": "algorithm.maxRadius",
          "label": "最大检测半径 (px)",
          "type": "number",
          "validation": { "min": 5, "max": 1000 }
        },
        {
          "key": "algorithm.sensitivity",
          "label": "置信度灵敏度",
          "type": "slider",
          "validation": { "min": 0.0, "max": 1.0, "step": 0.01 }
        },
        {
          "key": "algorithm.modelPath",
          "label": "权重模型文件路径",
          "type": "string"
        }
      ]
    }
  ]
}
```

---

## 🔧 开发与构建

如果您是开发者或希望为 ConfigManager 贡献代码，请参考以下指南搭建本地开发与构建环境。

### 系统要求

- **Node.js**: `22.x` 或以上版本
- **Rust**: `1.75+` (stable toolchain)
- **操作系统与构建工具依赖**：
  - **Windows**: Visual Studio 2022 / 2019 C++ 编译环境
  - **macOS**: Xcode Command Line Tools
  - **Linux (Ubuntu/Debian)**: 运行 `sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev patchelf`

### 1. 本地启动开发环境

```bash
# 1. 克隆代码仓库
git clone https://github.com/tlx2024/CongfigManager.git
cd CongfigManager

# 2. 安装根目录与前端依赖
npm ci
npm --prefix frontend ci

# 3. 启动开发模式 (同时拉起 Vite 开发服务器与 Tauri 调试窗口)
npm run dev
```

### 2. 质量检查与自动化测试

在提交代码前，建议运行完整的代码检查和后端单元测试：

```bash
# 执行前端 TypeScript 类型检查、diffLines 逻辑测试与前端构建
npm run check

# 执行 Rust 后端单元测试（校验版本管理、安全原子写入等核心逻辑）
cd src-tauri
cargo test --locked
```

### 3. 构建发布安装包

```bash
# 本地编译生产版本安装包 (生成产物位于 src-tauri/target/release/bundle/)
npm run build
```

---

## 📚 项目详细文档

为方便深入理解系统原理与开发流程，本项目提供了详尽的专项目录文档：

| 文档名称 | 路径 | 核心内容说明 |
|----------|------|--------------|
| 🛠️ **开发者指南** | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 本地运行、架构细节、锁文件管理及持续集成说明 |
| 🚀 **应用发布手册** | [docs/RELEASING.md](docs/RELEASING.md) | 版本号同步约定、Tag 打包流程与全平台安装包发布核对 |
| 📋 **版本设计规范** | [docs/plans/schema-config-versioning.md](docs/plans/schema-config-versioning.md) | Schema 与配置版本化分层设计、快照备份与回滚机制深度剖析 |
| 📄 **版权与署名说明** | [COPYRIGHT.md](COPYRIGHT.md) | 原作者版权归属声明与开源使用法律准则 |
| 🤝 **贡献指南** | [CONTRIBUTING.md](CONTRIBUTING.md) | 问题反馈、功能请求与代码提交标准流程 |

---

## 🗺️ 发展路线图 (Roadmap)

- [x] **v0.1.0 (当前版本)**
  - [x] 基于 Tauri 2 的轻量级跨平台桌面端应用架构
  - [x] JSON 与 XML 格式文件的双视图协同编辑（表单 / 源码）
  - [x] 基于 Groups Schema 的动态表单渲染与条件联动展示
  - [x] 智能 Schema 逆向推导与一键默认 Schema 生成
  - [x] 内置可视化 Schema 设计工作台
  - [x] 配置与 Schema 独立双轨版本管理与自动快照备份
  - [x] GitHub Actions 多平台自动化矩阵构建与发布（EXE/MSI/DMG/AppImage/DEB）
- [ ] **v0.2.0 (规划中)**
  - [ ] 跨版本可视化行级差异对比视图 (Visual Diff View)
  - [ ] 历史版本一键快速生成 Diff 报告与变更导出
- [ ] **v0.3.0 (规划中)**
  - [ ] 增加 YAML (`.yaml` / `.yml`) 与 TOML 格式的原生支持
  - [ ] 支持 JSON ↔ XML ↔ YAML 跨格式一键转换
- [ ] **v0.4.0 (规划中)**
  - [ ] 远程工作区支持（通过 SSH / Git 协议远程连接与同步配置目录）
  - [ ] 团队多人协作时的配置变更冲突检测与合并提示
- [ ] **v0.5.0 (远期规划)**
  - [ ] 批量配置一致性校验与导出报表
  - [ ] 行业配置模板库与自定义规则插件化扩展

---

## 🤝 参与贡献

我们非常欢迎并感谢社区提供任何形式的贡献！

1. **提交 Bug 或建议**：请先查阅已有 [Issues](https://github.com/tlx2024/CongfigManager/issues)，若无相同问题可创建新 Issue。
2. **贡献代码**：
   - Fork 本代码仓库并克隆到本地；
   - 基于 `main` 分支创建特性分支（例如 `git checkout -b feature/awesome-feature`）；
   - 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范编写提交说明（如 `feat: add yaml support` / `fix: handle empty schema group`）；
   - 确保通过 `npm run check` 与 `cargo test --locked`；
   - 提交 Pull Request 并详细描述修改意图与验证方式。

---

## 📄 开源许可证与版权声明

本项目采用 **[GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)](LICENSE)** 开源许可证。

- **版权归属**：Copyright (C) 2026 **[tlx2024](https://github.com/tlx2024)**。详细原作者说明见 [COPYRIGHT.md](COPYRIGHT.md)。
- **开源准则**：在分发、再分发或基于本项目开发衍生版本时，必须保留原有版权声明与许可声明；分发修改版或通过网络提供基于修改版的服务时，均须公开对应修改的完整源代码。
- **第三方组件**：本项目所引用的第三方依赖库各自保留其原本的开源许可证。

---

## 🙏 致谢

ConfigManager 的诞生与发展离不开开源社区众多优秀项目的坚实支持：

- [Tauri](https://tauri.app/) - 打造极致轻量、高效、安全的跨平台桌面应用底座
- [React](https://react.dev/) - 现代化组件化用户界面开发标准
- [Ant Design](https://ant.design/) - 优秀的桌面端企业级 UI 设计语言与组件生态
- [Rust](https://www.rust-lang.org/) - 赋予核心层极致的性能与内存安全保障
- [Vite](https://vitejs.dev/) - 下一代前端开发与构建工具链

---

## 📞 联系与支持

- 🐛 **问题反馈**：[GitHub Issues](https://github.com/tlx2024/CongfigManager/issues)
- 💡 **讨论与交流**：[GitHub Discussions](https://github.com/tlx2024/CongfigManager/discussions)
- 🌐 **官方主页与在线文档**：[https://tlx2024.github.io/CongfigManager/](https://tlx2024.github.io/CongfigManager/)

<div align="center">

**⭐ 如果 ConfigManager 对您的项目开发或配置管理有所帮助，欢迎在 GitHub 上点个 Star！**

Made with ❤️ by [tlx2024](https://github.com/tlx2024) and the Open Source Community.

</div>
