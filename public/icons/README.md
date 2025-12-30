# PWA 图标文件

请在此目录下放置以下尺寸的 PNG 图标文件：

## 必需图标

| 文件名 | 尺寸 | 用途 |
|--------|------|------|
| icon-72x72.png | 72x72 | Android 小图标 |
| icon-96x96.png | 96x96 | Android 图标 |
| icon-128x128.png | 128x128 | Chrome Web Store |
| icon-144x144.png | 144x144 | Android 高清图标 |
| icon-152x152.png | 152x152 | iOS iPad |
| icon-192x192.png | 192x192 | Android 主屏幕图标 |
| icon-384x384.png | 384x384 | Android 高清 |
| icon-512x512.png | 512x512 | Android 启动画面 |

## 可选图标

| 文件名 | 尺寸 | 用途 |
|--------|------|------|
| chat-icon.png | 96x96 | 快捷方式图标 |

## 设计规范

### 颜色
- 背景色：#14532d（品牌深绿色）
- 图标色：白色

### Maskable 图标
- 192x192 和 512x512 需要支持 maskable
- 安全区域：中心 80%（即边缘留 10% 空白）
- 重要内容必须在安全区域内

### 设计建议
1. 使用简化的品牌图标（如 ✨ 或学校 Logo）
2. 保持图标简洁，避免过多细节
3. 确保在小尺寸下仍然清晰可辨
4. 测试在不同背景色下的显示效果

## 生成工具

推荐使用以下工具生成多尺寸图标：

1. **PWA Asset Generator**
   ```bash
   npx pwa-asset-generator logo.svg ./public/icons
   ```

2. **Real Favicon Generator**
   https://realfavicongenerator.net/

3. **Maskable.app**
   https://maskable.app/editor

## 临时占位

在正式图标制作完成前，可以使用以下方式生成临时图标：

```bash
# 使用 ImageMagick 生成纯色占位图标
convert -size 512x512 xc:#14532d public/icons/icon-512x512.png
convert -size 192x192 xc:#14532d public/icons/icon-192x192.png
# ... 其他尺寸
```
