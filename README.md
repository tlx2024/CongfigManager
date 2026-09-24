# ConfigManager - Unified Configuration Management System

<div align="center">

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/tlx2024/CongfigManager/releases/tag/v0.1.0)
[![Tauri](https://img.shields.io/badge/Tauri-2.0+-24C8D8.svg?logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584.svg?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![CI Build](https://github.com/tlx2024/CongfigManager/actions/workflows/ci.yml/badge.svg)](https://github.com/tlx2024/CongfigManager/actions/workflows/ci.yml)
[![GitHub Pages](https://img.shields.io/badge/docs-GitHub%20Pages-orange.svg)](https://tlx2024.github.io/CongfigManager/)

**High-performance, cross-platform desktop workstation for visual JSON / XML configuration management and secure version control**

[English](README.md) · [简体中文](README-CN.md)

[Quick Start](#-quick-start) · [Download & Installation](#-download--installation) · [Features](#-features) · [Screenshots](#-screenshots) · [Architecture](#-architecture) · [Workspace & Schema](#-workspace--schema-specifications) · [Development & Build](#-development--build) · [Contributing](#-contributing)

</div>

---

## 📖 Overview

**ConfigManager** is a modern, cross-platform desktop application designed for engineering R&D, algorithm tuning, automated systems, and multi-environment deployments.

In complex engineering projects, configuration files are often scattered across various directories and formats. Manually editing JSON or XML files with plain text editors frequently introduces syntax errors and missing required fields, while lacking history version tracking and quick rollback mechanisms. Built on a **Tauri 2 + Rust + React 18** architecture, ConfigManager allows users to select a local configuration directory to achieve centralized configuration management, bidirectional synchronized form and source editing, schema-driven intelligent validation, safe pre-save snapshot backups, and dual-track version control—all within a clean, unified interface.

### 🎯 Use Cases

- ✅ **Algorithm & System Tuning**: Visual parameter adjustments for computer vision, robotics control, AI inference plugins, and complex configuration sets.
- ✅ **Application & Service Configuration Maintenance**: Centralized browsing and secure editing for desktop clients, embedded systems, and local microservice configurations.
- ✅ **Error-Proofing & Team Standards**: Define value boundaries, enum choices, regex formats, and required constraints via Schemas to eliminate human editing mistakes.
- ✅ **Version Auditing & Instant Rollback**: Archive snapshot backups before saving in production or testing environments, allowing instant one-click rollback to any historical version if anomalies arise.
- ✅ **Air-Gapped & High-Security Offline Environments**: 100% local execution and local file I/O with zero network relays and zero remote telemetry, safeguarding sensitive enterprise and research data.

### ⚡ Key Advantages

| Dimension | Description |
|---|---|
| 🚀 **Blazing Fast & Lightweight** | Native Tauri 2 + Rust core delivers millisecond cold starts with substantially lower RAM and CPU consumption than Electron |
| 📝 **Dual-View Editing** | Seamlessly switch between structured Form View (error-proof, intuitive widgets) and raw Source View (fine-grained control, complete view), with bidirectional synchronization |
| 📋 **Schema-Driven** | Purpose-built Groups Schema tailored for form presentation, featuring grouped tabs, range validation, conditional visibility, and dynamic nested arrays |
| 🪄 **Smart Reverse Inference** | No need to write schemas in advance; the system automatically analyzes existing JSON/XML files, infers form layouts, and generates standard schemas with one click |
| 🎨 **Visual Schema Studio** | Built-in visual schema designer to orchestrate fields, types, constraints, and layouts interactively with real-time form preview |
| 🛡️ **Dual-Track Versioning** | Independent version tracking for config files and schema files; automatic pre-save history snapshots with non-destructive diff inspection and safe restoration |
| 🔒 **Non-Invasive Metadata** | Version numbers and change logs reside strictly in `.meta/` directories, never altering or injecting non-standard fields into original JSON/XML files |
| 💻 **Zero-Dependency Cross-Platform** | Native packages for Windows x64, macOS (Apple Silicon & Intel), and major Linux distributions; end users do not need Node.js or Rust installed |

---

## 📦 Download & Installation

Pre-compiled ConfigManager binaries are automatically built and released across platforms via GitHub Actions. End users **do not need a development environment or runtime installed**—simply download the appropriate package for your operating system.

> **Current Official Release: [`v0.1.0`](https://github.com/tlx2024/CongfigManager/releases/tag/v0.1.0)**
> All download packages align directly with official GitHub Releases assets.

| OS | Architecture | Package Type | Description | Direct Download Link (v0.1.0) |
|---|---|---|---|---|
| **Windows** | x64 (64-bit) | NSIS Installer (`.exe`) | **Recommended**, guided setup wizard | [⬇️ Download EXE Installer](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_x64-setup.exe) |
| **Windows** | x64 (64-bit) | Windows Installer (`.msi`) | Enterprise silent deployment & GPO | [⬇️ Download MSI Installer](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_x64_en-US.msi) |
| **macOS** | Apple Silicon | DMG Image (`.dmg`) | Optimized for M1 / M2 / M3 / M4 Macs | [⬇️ Download ARM64 DMG](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_aarch64.dmg) |
| **macOS** | Intel x64 | DMG Image (`.dmg`) | For Intel-based Macs | [⬇️ Download Intel DMG](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_x64.dmg) |
| **Linux** | x64 (amd64) | AppImage (`.AppImage`) | **Recommended**, standalone portable file for all distros | [⬇️ Download AppImage](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_amd64.AppImage) |
| **Linux** | x64 (amd64) | Debian Package (`.deb`) | For Ubuntu, Debian, and derivatives | [⬇️ Download DEB Package](https://github.com/tlx2024/CongfigManager/releases/download/v0.1.0/ConfigReader.Config.Manager_0.1.0_amd64.deb) |

*You can also visit the [GitHub Releases Page](https://github.com/tlx2024/CongfigManager/releases) or the [GitHub Pages Download Portal](https://tlx2024.github.io/CongfigManager/#download) for detailed release logs.*

### 💡 Platform Tips

- **macOS Users**:
  The current build uses ad-hoc signing without Apple notarization. If macOS shows a warning stating "cannot be opened because the developer cannot be verified" or "the application is damaged", go to **System Settings → Privacy & Security** and click **Open Anyway**, or run the following command in Terminal to clear quarantine attributes:
  ```bash
  sudo xattr -cr /Applications/Config\ Manager.app
  ```
- **Linux Users**:
  After downloading the `.AppImage` file, grant executable permissions to launch it directly:
  ```bash
  chmod +x ConfigReader.Config.Manager_0.1.0_amd64.AppImage
  ./ConfigReader.Config.Manager_0.1.0_amd64.AppImage
  ```
  If using the `.deb` package, install via `sudo dpkg -i ConfigReader.Config.Manager_0.1.0_amd64.deb`.

---

## 🚀 Quick Start

Get started managing your configuration files safely in four simple steps:

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  1. Launch App   │ ──> │ 2. Load Workspace│ ──> │ 3. Form / Source │ ──> │ 4. Safe Save &   │
│  Ready to use    │     │ Select local dir │     │ Live validation  │     │ Atomic backup    │
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
```

1. **Launch the Application**: On first launch, the app includes a built-in interactive algorithm sample workspace (with `algorithms.json` and matching Schema) so you can explore all features right away.
2. **Select Workspace**: Click "Browse..." in the top toolbar to choose your project's configuration directory, then click "Load". Configuration files can be placed directly in the root or inside a `config/` subdirectory (supports `*.json` and `*.xml`).
3. **Visual Editing**: Select a configuration file from the sidebar list:
   - Switch to the **Form** tab: Modify parameters through structured cards, sliders, switches, and dropdowns with real-time range validation and dynamic conditional visibility;
   - Switch to the **Source** tab: Inspect or fine-tune raw text directly, ideal for bulk pasting or reviewing low-level formatting.
4. **Safe Save & Rollback**: Once satisfied, click "Save Config". The backend automatically creates a timestamped snapshot backup in `history/` and increments the version before overwriting. If you need to recover previous parameters, simply switch to the "History" tab to load and inspect any past snapshot before restoring it.

---

## 🖥️ Screenshots

The following screenshots are captured from ConfigManager running the project's built-in sample workspace:

### 1. Structured Form Editor View
*Renders input controls grouped by Schema, supporting numerical boundaries, toggles, conditional visibility, and array management:*
![Form Editor Example](docs/screenshots/main-form.png)

### 2. Native Source Editor View
*Provides a complete code inspection and editing environment preserving indentation and syntax, tailored for fine-grained changes:*
![Source Editor Example](docs/screenshots/source-editor.png)

### 3. Visual Schema Studio
*Define field attributes, validation rules, default values, and group layouts visually without hand-crafting complex JSON, featuring real-time form preview:*
![Schema Structure Editor](docs/screenshots/schema-editor.png)

---

## ✨ Features

### 1️⃣ Dual-View Collaborative Editing (Form & Source Dual View)

- **Dynamic Smart Forms**: Automatically renders controls based on configuration types and Schema specifications, including string inputs, number spinners/sliders, boolean switches, enum radios/dropdowns, color pickers, and dynamic add/remove array items.
- **Direct Source Mode Control**: Switch to the raw source editor at any time to review and edit original JSON or XML markup.
- **Lossless In-Memory Isolation**: All temporary changes in the editor are kept in memory and only written to disk upon clicking "Save Config", preventing accidental corruption of existing files.

### 2️⃣ Schema-Driven & Smart Reverse Inference (Schema Engine)

- **Zero-Barrier Out of the Box**: Even if your project only has raw config files and no schemas, ConfigManager automatically analyzes data structures upon loading and infers a default dynamic form layout.
- **One-Click Standard Schema Generation**: When a missing schema is detected, the system extracts field hierarchies and creates a baseline schema under `schemas/`. Existing custom schemas are strictly protected and never overwritten.
- **Groups Schema Specification**: Employs the form-oriented Groups Schema standard, offering cleaner grouping (`groups`), conditional display rules (`conditions`), and interaction control compared to traditional JSON Schema.

### 3️⃣ Built-in Visual Schema Studio (Schema Studio)

- **Pure Graphical Orchestration**: Manage workspace Schema files from the left pane while visually editing groups, adding/removing fields, tweaking types, and configuring required/boundary rules in the center canvas.
- **Instant Interactive Preview**: As you design the schema, the right preview panel live-renders the resulting dynamic form, allowing immediate verification of field layouts and conditional rules.
- **Independent Version History**: Schema files feature their own version tracking and snapshot backup mechanism, safeguarding definitions during multi-developer collaboration.

### 4️⃣ Dual-Track Versioning & Safe Atomic Write (Safe Versioning & Atomic Write)

- **Automatic Snapshot Backups**: Prior to saving changes, the Rust backend automatically archives the current disk file into `history/` tagged with timestamp and version number.
- **Non-Invasive Metadata Management**: Version numbers, last updater, timestamps, and content hashes are stored in a dedicated `.meta/` directory, keeping business config files pure without third-party comments or injected metadata.
- **Atomic Write & Replace (Atomic Write)**: File persistence writes to a temporary file first, validates integrity, and performs an atomic rename, preventing file corruption even during unexpected crashes or power failures.
- **Path Traversal Defense**: The Rust backend strictly validates file paths against directory traversal attacks, ensuring file operations remain securely contained within the workspace.

---

## 📐 Architecture

### 1. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         ConfigManager Desktop                          │
├────────────────────────────────────────────────────────────────────────┤
│  Frontend Presentation Layer (React 18 + TypeScript + Ant Design 5 + Vite) │
│  ├── Dynamic Form Engine (DynamicForm)  ── Form rendering, controls, conditions │
│  ├── Source Editor Module (SourceEditor) ── Highlighting, validation, two-way sync │
│  ├── Schema Studio (SchemaEditor)       ── Visual orchestration, live preview │
│  └── Diff & History                     ── Snapshots, rollback, audit log    │
├────────────────────────────────────────────────────────────────────────┤
│  IPC Communication Bridge (@tauri-apps/api/core)                       │
├────────────────────────────────────────────────────────────────────────┤
│  Native Core Layer (Tauri 2 + Rust Core)                               │
│  ├── Workspace & File Scanner           ── Detect JSON/XML & config directory│
│  ├── Safe IO Engine                     ── Atomic write (tempfile), traversal guard│
│  ├── Schema Reverse Inference Engine    ── Infer structure & generate schemas│
│  ├── Version & Metadata (.meta)         ── Independent dual-track versioning │
│  └── History Snapshot Service (history/)── Timestamped backups & rollback    │
└────────────────────────────────────────────────────────────────────────┘
```

### 2. Workspace File Structure Conventions

ConfigManager follows a clear, non-invasive file organization pattern. A standard configuration workspace is structured as follows:

```text
workspace_root/                   # Workspace root (or inside a config/ subdirectory)
├── algorithms.json               # Business configuration file (JSON format)
├── device_settings.xml           # Business configuration file (XML format)
│
├── schemas/                      # Schema definition directory
│   ├── algorithms.schema.json    # Custom Groups Schema for algorithms.json
│   └── device_settings.schema.json
│
├── history/                      # History snapshot archives (auto-generated on save)
│   ├── algorithms.json.1737600000.bak
│   └── algorithms.schema.json.1737600000.bak
│
└── .meta/                        # Internal version metadata (does not alter config files)
    ├── algorithms.json.meta.json
    └── algorithms.schema.json.meta.json
```

### 3. Tech Stack Matrix

| Layer | Technology / Library | Purpose & Role |
|---|---|---|
| **Desktop Base** | [Tauri 2.0](https://tauri.app/) | Ultra-lightweight, secure cross-platform desktop runtime and native sandbox |
| **Native Core** | [Rust 1.75+](https://www.rust-lang.org/) | High-performance file I/O, atomic operations, path validation, and strict typing |
| **Frontend Framework** | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | Component-based view architecture, type safety, and predictable state management |
| **UI Design System** | [Ant Design 5](https://ant.design/) | Modern enterprise component library powering forms, drawers, and layouts |
| **Build Tool** | [Vite 5](https://vitejs.dev/) | High-speed frontend development server with HMR and Rollup bundler |
| **Format Processing** | `serde_json` + `quick-xml` | High-performance streaming JSON and XML serialization/deserialization |
| **Continuous Integration** | GitHub Actions | Automated cross-platform matrix builds (Windows/macOS/Linux) and releases |

---

## 🌟 Workspace & Schema Specifications

### Example 1: Business Configuration File (`algorithms.json`)

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

### Example 2: Corresponding Groups Schema Definition (`schemas/algorithms.schema.json`)

```json
{
  "name": "Circle Detection Algorithm Configuration",
  "description": "Defines hyperparameters and model path for circle detection",
  "groups": [
    {
      "id": "basic",
      "title": "Basic Parameters",
      "description": "Algorithm toggle and basic info",
      "fields": [
        {
          "key": "algorithm.name",
          "label": "Algorithm Identifier",
          "type": "string",
          "required": true,
          "description": "Unique algorithm name identifier"
        },
        {
          "key": "algorithm.enabled",
          "label": "Enable Algorithm",
          "type": "boolean",
          "defaultValue": true
        }
      ]
    },
    {
      "id": "detection",
      "title": "Detection Thresholds",
      "description": "Adjustable only when algorithm is enabled",
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
          "label": "Min Detection Radius (px)",
          "type": "number",
          "validation": { "min": 1, "max": 500 }
        },
        {
          "key": "algorithm.maxRadius",
          "label": "Max Detection Radius (px)",
          "type": "number",
          "validation": { "min": 5, "max": 1000 }
        },
        {
          "key": "algorithm.sensitivity",
          "label": "Confidence Sensitivity",
          "type": "slider",
          "validation": { "min": 0.0, "max": 1.0, "step": 0.01 }
        },
        {
          "key": "algorithm.modelPath",
          "label": "Model Weight Path",
          "type": "string"
        }
      ]
    }
  ]
}
```

---

## 🔧 Development & Build

If you are a developer or wish to contribute to ConfigManager, refer to the following guidelines to set up your local development environment.

### System Requirements

- **Node.js**: `22.x` or higher
- **Rust**: `1.75+` (stable toolchain)
- **OS & Build Tool Dependencies**:
  - **Windows**: Visual Studio 2022 / 2019 C++ build tools
  - **macOS**: Xcode Command Line Tools
  - **Linux (Ubuntu/Debian)**: Run `sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev patchelf`

### 1. Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/tlx2024/CongfigManager.git
cd CongfigManager

# 2. Install root and frontend dependencies
npm ci
npm --prefix frontend ci

# 3. Start development mode (launches Vite dev server and Tauri debug window)
npm run dev
```

### 2. Quality Checks & Automated Testing

Before committing code, running the complete test suite and linters is recommended:

```bash
# Run frontend TypeScript type checking, diffLines tests, and frontend build
npm run check

# Run Rust backend unit tests (validating versioning, atomic write, and core logic)
cd src-tauri
cargo test --locked
```

### 3. Build Production Installers

```bash
# Build production installers locally (outputs located in src-tauri/target/release/bundle/)
npm run build
```

---

## 📚 Documentation

For deeper insights into system internals and development workflows, refer to the dedicated documentation files:

| Document | Path | Key Topics |
|---|---|---|
| 🛠️ **Developer Guide** | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, architectural details, lockfile management, and CI workflows |
| 🚀 **Release Manual** | [docs/RELEASING.md](docs/RELEASING.md) | Version synchronization, tag bundling procedures, and multi-platform verification |
| 📋 **Versioning Specification** | [docs/plans/schema-config-versioning.md](docs/plans/schema-config-versioning.md) | Tiered version design, history snapshots, and rollback mechanics |
| 📄 **Copyright & Attribution** | [COPYRIGHT.md](COPYRIGHT.md) | Original author copyright notice and open-source legal guidelines |
| 🤝 **Contributing Guide** | [CONTRIBUTING.md](CONTRIBUTING.md) | Issue reporting, feature requests, and Pull Request submission standards |

---

## 🗺️ Roadmap

- [x] **v0.1.0 (Current)**
  - [x] Lightweight cross-platform desktop application built with Tauri 2
  - [x] Dual-view synchronized editing for JSON and XML files (Form / Source)
  - [x] Dynamic form rendering and conditional visibility based on Groups Schema
  - [x] Smart reverse Schema inference and one-click default Schema generation
  - [x] Built-in visual Schema Studio
  - [x] Dual-track independent versioning and automated snapshot backups
  - [x] GitHub Actions automated multi-platform matrix builds and releases (EXE/MSI/DMG/AppImage/DEB)
- [ ] **v0.2.0 (Planned)**
  - [ ] Visual line-by-line diff comparison view across versions (Visual Diff View)
  - [ ] One-click diff report generation and change export from historical snapshots
- [ ] **v0.3.0 (Planned)**
  - [ ] Native support for YAML (`.yaml` / `.yml`) and TOML formats
  - [ ] One-click cross-format conversion among JSON ↔ XML ↔ YAML
- [ ] **v0.4.0 (Planned)**
  - [ ] Remote workspace support (connect and synchronize config directories via SSH / Git)
  - [ ] Multi-user team collaboration conflict detection and merge assistance
- [ ] **v0.5.0 (Long-term)**
  - [ ] Batch configuration consistency validation and exportable compliance reports
  - [ ] Industry template library and pluggable custom rule extensions

---

## 🤝 Contributing

Contributions of all kinds are warmly welcomed and appreciated!

1. **Reporting Bugs or Feature Ideas**: Check existing [Issues](https://github.com/tlx2024/CongfigManager/issues) first. If no matching issue exists, feel free to open a new one.
2. **Submitting Code**:
   - Fork the repository and clone it locally;
   - Create a feature branch off `main` (e.g., `git checkout -b feature/awesome-feature`);
   - Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (e.g., `feat: add yaml support` / `fix: handle empty schema group`);
   - Ensure `npm run check` and `cargo test --locked` pass cleanly;
   - Submit a Pull Request describing your changes and verification steps in detail.

---

## 📄 License & Copyright

This project is licensed under the **[GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)](LICENSE)**.

- **Copyright**: Copyright (C) 2026 **[tlx2024](https://github.com/tlx2024)**. See [COPYRIGHT.md](COPYRIGHT.md) for full attribution.
- **Open Source Terms**: All distributions, redistributions, or derivative works must preserve copyright and license notices. If distributing modified versions or hosting modified services over a network, the corresponding complete source code must be made publicly available under AGPL-3.0.
- **Third-Party Libraries**: Third-party dependencies integrated in this project retain their respective open-source licenses.

---

## 🙏 Acknowledgements

ConfigManager is built upon and inspired by outstanding open-source projects:

- [Tauri](https://tauri.app/) - Ultra-lightweight, efficient, and secure cross-platform desktop foundation
- [React](https://react.dev/) - Modern component-driven user interface standard
- [Ant Design](https://ant.design/) - Enterprise-grade desktop UI design system and components
- [Rust](https://www.rust-lang.org/) - Exceptional performance and memory safety for the native core
- [Vite](https://vitejs.dev/) - Next-generation frontend tooling and bundler

---

## 📞 Contact & Support

- 🐛 **Issue Tracker**: [GitHub Issues](https://github.com/tlx2024/CongfigManager/issues)
- 💡 **Discussions**: [GitHub Discussions](https://github.com/tlx2024/CongfigManager/discussions)
- 🌐 **Official Website & Docs**: [https://tlx2024.github.io/CongfigManager/](https://tlx2024.github.io/CongfigManager/)

<div align="center">

**⭐ If ConfigManager helps your project or workflow, please give us a Star on GitHub!**

Made with ❤️ by [tlx2024](https://github.com/tlx2024) and the Open Source Community.

</div>
