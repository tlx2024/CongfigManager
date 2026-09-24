# 发布桌面应用

CI 在 Pull Request、`main` 推送和手动触发时构建 Windows、macOS、Linux 安装包，结果保存在该次 Actions 运行的 Artifacts 中。只有推送版本标签才会把六个安装文件一起发布到 GitHub Releases。

## 发布步骤

1. 将 `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、根目录和 `frontend/` 下的 `package.json` 更新为同一个版本，并更新对应 lockfile。
2. 在本地运行 `npm run check` 和 `cd src-tauri && cargo test --locked`。
3. 提交并推送到 `main`，确认 **Build desktop apps** 工作流的四个平台构建通过。
4. 为该提交创建并推送 `v<版本号>` 标签，例如 `v0.1.0`。工作流会再次构建，校验标签与应用版本一致，并在全部六个安装包成功上传后发布 Release。

```bash
git tag v0.1.0
git push origin v0.1.0
```

发布文件包括 Windows x64 的 EXE/MSI、macOS Apple Silicon 与 Intel 的 DMG，以及 Linux x64 的 AppImage/DEB。当前 macOS 构建使用临时签名，未进行 Apple 公证；如果以后配置正式签名与公证，应同步更新 README 和 Release 说明。

Pages 站点在 `main` 上更新 `docs/site/` 后自动部署。首次部署前，在仓库 Settings → Pages 中将 Source 设为 GitHub Actions。
