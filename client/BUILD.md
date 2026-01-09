# 打包说明

## 前置条件

在打包之前，需要先准备好图标文件：
- `assets/icon.ico` - Windows图标（可选）
- `assets/icon.icns` - Mac图标（可选）
- `assets/icon.png` - Linux图标（可选）

如果没有这些图标文件，electron-builder 会使用默认图标。

## 安装依赖

```bash
cd client
npm install
```

## 打包命令

### Windows 系统

```bash
# 打包为 Windows 安装包 (NSIS)
npm run build:win

# 或者直接使用
npm run build
```

生成的文件位置：`dist/发布订阅通知 Setup 1.0.0.exe`

### Mac 系统

```bash
# 打包为 DMG 安装包
npm run build:mac
```

生成的文件位置：`dist/发布订阅通知-1.0.0.dmg`

### Linux 系统

```bash
# 打包为 AppImage 和 deb 包
npm run build:linux
```

生成的文件位置：
- `dist/发布订阅通知-1.0.0.AppImage`
- `dist/发布订阅通知_1.0.0_amd64.deb`

## 打包选项说明

### Windows 打包目标

在 `package.json` 中可以配置：

```json
"win": {
  "target": [
    "nsis",          // NSIS安装程序（推荐）
    "portable",      // 便携版（免安装）
    "zip"           // ZIP压缩包
  ],
  "icon": "assets/icon.ico"
}
```

### Mac 打包目标

```json
"mac": {
  "target": [
    "dmg",           // DMG磁盘镜像（推荐）
    "zip"           // ZIP压缩包
  ],
  "icon": "assets/icon.icns"
}
```

### Linux 打包目标

```json
"linux": {
  "target": [
    "AppImage",      // AppImage格式（通用）
    "deb",           // Debian/Ubuntu包
    "rpm",           // Red Hat/CentOS包
    "snap"          // Snap包
  ],
  "icon": "assets/icon.png"
}
```

## 分发打包结果

打包完成后，`dist` 目录下会生成安装包文件：

- **Windows**: `发布订阅通知 Setup 1.0.0.exe`
  - 双击安装即可使用

- **Mac**: `发布订阅通知-1.0.0.dmg`
  - 双击挂载，拖拽到应用程序文件夹

- **Linux**: `发布订阅通知-1.0.0.AppImage`
  - 添加执行权限：`chmod +x 发布订阅通知-1.0.0.AppImage`
  - 直接运行：`./发布订阅通知-1.0.0.AppImage`

## 注意事项

1. **首次打包时间较长**：Electron 需要下载二进制文件，约需要 5-10 分钟

2. **跨平台打包**：
   - 在 Windows 上只能打包 Windows 版本
   - 在 Mac 上可以打包 Mac 和 Linux 版本
   - 在 Linux 上可以打包 Linux 版本
   - 如需跨平台打包，需要使用 CI/CD 或虚拟机

3. **签名问题**：
   - Windows 打包可能需要代码签名证书
   - Mac 打包需要开发者签名
   - 未签名的应用可能会有安全警告

4. **自动更新**：
   - 如果需要自动更新功能，需要配置 `electron-updater`
   - 需要搭建更新服务器

## 清理打包文件

```bash
# 清理 dist 目录
rm -rf dist

# Windows
rd /s /q dist
```
