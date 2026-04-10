# Design Tokens 升级方案（基于 Claude DESIGN.md）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 升级 `lib/design-tokens.ts`，应用 Claude DESIGN.md 的暖色调、衬线字体和 ring-shadow 风格，不改变任何业务逻辑

**Architecture:** 保持现有 token 结构不变，仅更新数值和新增语义 token，所有改动仅影响视觉呈现

---

## 升级对照表

### 1. 颜色系统 (Colors)

| Token | 当前值 | 建议值 | Claude 参考 |
|-------|--------|--------|-----------|
| `slateColors[50]` | `#f8f8f8` | `#faf9f5` | Ivory `#faf9f5` |
| `slateColors[100]` | `#ebebeb` | `#f0eee6` | Border Cream `#f0eee6` |
| `slateColors[200]` | `#d4d4d4` | `#e8e6dc` | Warm Sand `#e8e6dc` |
| `slateColors[300]` | `#b0b0b0` | `#b0aea5` | Warm Silver `#b0aea5` |
| `slateColors[400]` | `#8a8a8a` | `#87867f` | Stone Gray `#87867f` |
| `slateColors[500]` | `#6b6b6b` | `#615d59` | Olive Gray `#615d59` |
| `slateColors[600]` | `#525252` | `#4d4c48` | Charcoal Warm `#4d4c48` |
| `slateColors[700]` | `#404040` | `#3d3d3a` | Dark Warm `#3d3d3a` |
| `slateColors[800]` | `#2d2d2d` | `#30302e` | Dark Surface `#30302e` |
| `slateColors[900]` | `#1a1a1a` | `#141413` | Near Black `#141413` |
| `slateColors[950]` | `#0f0f0f` | `#141413` | Deep Dark `#141413` |

**说明：** 全部改为暖色调（黄褐底色），无冷蓝灰。950/900 合并为同一 Near Black 值。

新增 `creamColors` 在 `colors` 导出中：
```ts
export const colors = {
  brand: brandColors,
  slate: slateColors,
  cream: creamColors,   // ← 新增
  semantic: semanticColors,
  gradients,
} as const
```

### 2. 字体系统 (Typography)

| Token | 当前 | 建议 | 说明 |
|-------|------|------|------|
| `fontFamily.serif` | 无 | `"Georgia", "Noto Serif SC", "STSong", serif` | 衬线字体，用于标题 |
| `fontFamily.sans` | Inter | 保持 | 正文保持 Inter |
| `fontFamily.mono` | JetBrains Mono | 保持 | 保持 |

**新增 typography.token 组合：**
```ts
serif: {
  fontSize: '32px',
  lineHeight: '1.10',  // Claude tight heading
  fontWeight: '500',   // Claude weight 500 for all serif
  letterSpacing: 'normal',
}
```

### 3. 圆角系统 (Border Radius)

| Token | 当前 | 建议 | Claude 参考 |
|-------|------|------|-----------|
| `sm` | `6px` | `4px` | Sharp (4px) |
| `md` | `8px` | `8px` | Comfortably rounded (8px) |
| `lg` | `12px` | `12px` | Generously rounded (12px) |
| `xl` | `16px` | `16px` | Very rounded (16px) |
| `2xl` | `24px` | `32px` | Maximum rounded (32px) |

### 4. 阴影系统 (Shadows)

替换单层阴影为 Claude 风格的 ring-shadow + whisper-shadow 系统：

| Token | 当前 | 建议 |
|-------|------|------|
| `sm` | `0 1px 2px rgba(0,0,0,0.05)` | `0 0 0 1px rgba(0,0,0,0.06)` |
| `md` | 保持 | 保持（input 等场景需要传统阴影）|
| `lg` | 保持 | 保持 |
| `xl` | 保持 | 保持 |
| `whisper` | 无 | `0 4px 24px rgba(0,0,0,0.05)` — 极轻阴影 |
| `ring` | 无 | `0 0 0 1px rgba(0,0,0,0.08)` — ring-shadow |
| `glow` | 品牌绿光晕 | 保持 |

---

## 文件改动清单

### Modify: `lib/design-tokens.ts`

- [ ] `slateColors` — 全部 11 级改为暖色调
- [ ] `borderRadius['2xl']` — `24px` → `32px`
- [ ] `fontFamily` — 新增 `serif`
- [ ] `typography` — 新增 `serif` 字号组合
- [ ] `shadows` — 新增 `whisper` 和 `ring`
- [ ] `colors` — 新增 `cream` 导出

---

## 改动文件预览

```diff
- export const slateColors = {
-   950: '#0f0f0f',
-   900: '#1a1a1a',
-   800: '#2d2d2d',
-   700: '#404040',
-   600: '#525252',
-   500: '#6b6b6b',
-   400: '#8a8a8a',
-   300: '#b0b0b0',
-   200: '#d4d4d4',
-   100: '#ebebeb',
-   50: '#f8f8f8',
- } as const
+ export const slateColors = {
+   950: '#141413',  // Near Black (was #0f0f0f)
+   900: '#141413',  // Near Black (was #1a1a1a)
+   800: '#30302e',  // Dark Surface (was #2d2d2d)
+   700: '#3d3d3a', // Dark Warm (was #404040)
+   600: '#4d4c48',  // Charcoal Warm (was #525252)
+   500: '#615d59',  // Olive Gray (was #6b6b6b)
+   400: '#87867f',  // Stone Gray (was #8a8a8a)
+   300: '#b0aea5',  // Warm Silver (was #b0b0b0)
+   200: '#e8e6dc',  // Warm Sand (was #d4d4d4)
+   100: '#f0eee6',  // Border Cream (was #ebebeb)
+   50: '#faf9f5',   // Ivory (was #f8f8f8)
+ } as const

export const fontFamily = {
  sans: '"Inter", "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", monospace',
+ serif: '"Georgia", "Noto Serif SC", "STSong", serif',
} as const

export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.05)',
  lg: '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)',
  xl: '0 20px 25px -5px rgba(0,0,0,0.08), 0 10px 10px -5px rgba(0,0,0,0.03)',
  '2xl': '0 25px 50px -12px rgba(0,0,0,0.15)',
  inner: 'inset 0 2px 4px rgba(0,0,0,0.05)',
  glow: '0 0 20px rgba(20,83,45,0.15)',
  input: '0 2px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)',
  inputFocus: '0 4px 12px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.12), 0 0 0 3px rgba(20,83,45,0.1)',
+ whisper: '0 4px 24px rgba(0,0,0,0.05)',
+ ring: '0 0 0 1px rgba(0,0,0,0.08)',
} as const

export const borderRadius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
- '2xl': '24px',
+ '2xl': '32px',
  full: '9999px',
} as const

export const typography = {
  display: { fontSize: '48px', lineHeight: '1.1', fontWeight: '700' },
  h1: { fontSize: '36px', lineHeight: '1.2', fontWeight: '700' },
  h2: { fontSize: '28px', lineHeight: '1.3', fontWeight: '600' },
  h3: { fontSize: '22px', lineHeight: '1.4', fontWeight: '600' },
  h4: { fontSize: '18px', lineHeight: '1.5', fontWeight: '600' },
  bodyLg: { fontSize: '17px', lineHeight: '1.7', fontWeight: '400' },
  body: { fontSize: '15px', lineHeight: '1.7', fontWeight: '400' },
  bodySm: { fontSize: '14px', lineHeight: '1.6', fontWeight: '400' },
  caption: { fontSize: '13px', lineHeight: '1.5', fontWeight: '400' },
  small: { fontSize: '12px', lineHeight: '1.4', fontWeight: '400' },
+ serif: { fontSize: '32px', lineHeight: '1.10', fontWeight: '500' },
} as const
```

---

## 验证清单

- [ ] `npm run build` 通过
- [ ] 所有 `slateColors[n]` 引用处视觉无异常
- [ ] 侧边栏、卡片、按钮圆角正常
- [ ] 无新增 console.error
