# 图标文件说明

此目录包含应用程序图标文件。

## 文件列表

- `icon.svg` - SVG格式图标源文件（已生成）
- `icon.png` - PNG格式图标（用于Linux）
- `icon.ico` - Windows图标文件
- `icon.icns` - Mac图标文件

## 如何生成其他格式

### 生成 PNG 图标
1. 使用浏览器或图片编辑器打开 `icon.svg`
2. 另存为 512x512 的 PNG 文件
3. 命名为 `icon.png`

### 生成 ICO 图标（Windows）
推荐使用在线工具：
- 访问 https://favicon.io/favicon-converter/
- 上传 `icon.svg` 文件
- 下载生成的 `icon.ico` 文件

或使用 ImageMagick：
```bash
convert icon.svg -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

### 生成 ICNS 图标（Mac）
在 Mac 上使用 iconutil：
```bash
# 创建 iconset 目录
mkdir icon.iconset

# 生成不同尺寸的图标
sips -z 16 16     icon.svg --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.svg --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.svg --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.svg --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.svg --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.svg --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.svg --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.svg --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.svg --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.svg --out icon.iconset/icon_512x512@2x.png

# 生成 icns 文件
iconutil -c icns icon.iconset -o icon.icns
```

## 快速开始（使用在线工具）

如果你在 Windows 上：

1. 访问 https://favicon.io/favicon-converter/
2. 上传 `icon.svg`
3. 下载 `icon.ico`
4. 将文件放到 `assets` 目录

如果你在 Mac 上：

1. 访问 https://cloudconvert.com/svg-to-icns
2. 上传 `icon.svg`
3. 下载 `icon.icns`
4. 将文件放到 `assets` 目录

## 图标设计说明

图标采用紫色渐变背景，白色铃铛图标配合红色通知圆点，代表消息通知功能。
