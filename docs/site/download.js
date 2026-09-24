// Copyright (C) 2026 tlx2024
// SPDX-License-Identifier: AGPL-3.0-or-later
const repo = 'tlx2024/CongfigManager';
const releasesUrl = `https://github.com/${repo}/releases`;
const status = document.getElementById('release-status');
const fallbackTag = 'v0.1.0';
const fallbackFiles = [
  'ConfigReader.Config.Manager_0.1.0_x64-setup.exe',
  'ConfigReader.Config.Manager_0.1.0_x64_en-US.msi',
  'ConfigReader.Config.Manager_0.1.0_aarch64.dmg',
  'ConfigReader.Config.Manager_0.1.0_x64.dmg',
  'ConfigReader.Config.Manager_0.1.0_amd64.AppImage',
  'ConfigReader.Config.Manager_0.1.0_amd64.deb'
];

function downloadLabel(name) {
  if (/\.exe$/i.test(name)) return '下载 EXE 安装包 (推荐)';
  if (/\.msi$/i.test(name)) return '下载 MSI 安装包';
  if (/\.AppImage$/i.test(name)) return '下载 AppImage (免安装)';
  if (/\.deb$/i.test(name)) return '下载 DEB 安装包';
  if (/(aarch64|arm64)/i.test(name)) return '下载 Apple Silicon DMG';
  if (/(x64|x86_64|amd64)/i.test(name)) return '下载 Intel x64 DMG';
  return '下载 DMG 镜像';
}

function platformFor(name) {
  if (/\.(exe|msi)$/i.test(name)) return 'windows';
  if (/\.dmg$/i.test(name)) return 'macos';
  if (/\.(AppImage|deb)$/i.test(name)) return 'linux';
  return null;
}

function renderDownloads(tag, assets, isFallback = false) {
  const grouped = { windows: [], macos: [], linux: [] };
  for (const asset of assets) {
    const platform = platformFor(asset.name || '');
    if (platform && asset.browser_download_url) grouped[platform].push(asset);
  }

  const count = grouped.windows.length + grouped.macos.length + grouped.linux.length;
  if (status) {
    status.innerHTML = isFallback
      ? `当前版本：<strong class="tag-highlight">${tag}</strong> · 已收录 ${count} 个官方发布包（直达 GitHub Releases 下载）`
      : `最新发布版本：<strong class="tag-highlight">${tag}</strong> · 共计 ${count} 个官方安装包`;
  }
  for (const [platform, downloads] of Object.entries(grouped)) {
    const container = document.querySelector(`.download-links[data-platform="${platform}"]`);
    if (!container || !downloads.length) continue;
    container.replaceChildren();
    for (const asset of downloads) {
      const link = document.createElement('a');
      link.href = asset.browser_download_url;
      link.className = 'download-btn';
      link.title = asset.name;
      const isPrimary = /(\.exe|\.AppImage|aarch64.*\.dmg)/i.test(asset.name);
      if (isPrimary) link.classList.add('download-btn-primary');
      link.innerHTML = `
        <span class="btn-text">${downloadLabel(asset.name)}</span>
        <span class="btn-badge">${asset.name.split('.').pop()?.toUpperCase()}</span>
      `;
      container.appendChild(link);
    }
  }
}

async function showLatestDownloads() {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (response.status === 404) {
      renderDownloads(fallbackTag, fallbackFiles.map((name) => ({
        name,
        browser_download_url: `${releasesUrl}/download/${fallbackTag}/${encodeURIComponent(name)}`
      })), true);
      return;
    }
    if (!response.ok) throw new Error(`GitHub API: ${response.status}`);

    const release = await response.json();
    renderDownloads(release.tag_name, release.assets || []);
  } catch {
    renderDownloads(fallbackTag, fallbackFiles.map((name) => ({
      name,
      browser_download_url: `${releasesUrl}/download/${fallbackTag}/${encodeURIComponent(name)}`
    })), true);
  }
}

showLatestDownloads();
