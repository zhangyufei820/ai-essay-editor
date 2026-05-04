# Design Constraints

负责人：ui-ux-pro-max  
范围：只重构组件、布局、样式和展示层结构，不改变业务逻辑。

## 产品类型与核心路径

- 产品类型：面向学生、家长、教师的 AI 教育 SaaS，核心能力是作文批改、题目解析、AI 写作与多模型学习助手。
- 核心用户路径：
  - 访客在首页理解产品价值，进入 `/chat` 或具体模型页。
  - 用户登录/注册后使用 AI 对话、作文批改、积分/会员与历史记录。
  - 支付/价格页承接转化。

## 主色调识别

- 主色来源：
  - `app/globals.css`：`#4CAF50` 绿色主色与 `--primary`。
  - `lib/design-tokens.ts`：`#22c55e`、`#14532d` 森林绿品牌阶。
  - `app/layout.tsx`：`themeColor: #14532d`。
  - 主页、侧边栏与 CTA 大量使用 emerald/green。
- 保留策略：
  - 保留绿色/森林绿作为品牌主色，不替换为其他品牌色。
  - 统一主色语义：primary、primary-hover、primary-muted、primary-surface、primary-border、primary-ring。
  - 辅助色只用于信息状态、强调与局部标签，不替代主色。

## 设计方向

- Aesthetic direction：`calm academic clarity`，即清晰、温暖、可信赖的教育工具感。
- 视觉关键词：森林绿主色、暖白背景、清晰层级、低噪声卡片、稳定交互、适合高频学习场景。
- 避免方向：过度装饰、过强玻璃拟态、紫蓝渐变替换主色、营销卡片堆砌、改变用户操作流程。

## 当前 UI 问题诊断

- 布局层级：部分首页模块标题阴影过重，展示感强但阅读质感不够克制。
- 间距：不同模块的卡片 padding、section padding、移动端间距节奏不完全一致。
- 字体：全局字号已存在，但组件内存在较多独立字号和行高，层级可进一步统一。
- 色彩：存在 `#4CAF50` 与 `#22c55e` 两套绿色来源，需要语义化对齐；米色背景使用可保留但需降低单一暖色占比。
- 组件一致性：Button/Card/Input 等基础组件偏默认，首页卡片和侧边栏有自定义风格，系统性不足。
- 响应式：首页快捷入口 320px 下需要确保卡片文字不拥挤；桌面/移动标题尺度需更稳。
- 状态：hover 普遍可见，但部分 hover 使用位移，需要避免造成布局跳动；focus 可见性要统一。
- Loading/empty/error：已有组件，但视觉语言需要与新 tokens 对齐。
- 可访问性：需要补齐 icon-only button 的 `aria-label`，确保跳转链接 focus-visible 清晰。

## Typography Scale

- Display：`clamp(2.5rem, 5vw, 4.75rem)`，用于首页 hero。
- H1：`clamp(2rem, 4vw, 3.5rem)`。
- H2：`clamp(1.75rem, 3vw, 2.75rem)`。
- H3：`1.25rem - 1.5rem`。
- Body：`1rem / 1.7`。
- Body small：`0.875rem / 1.6`。
- Caption：`0.75rem - 0.8125rem / 1.5`。
- 中文界面优先使用较高行高和中等字重，避免大面积超粗字重。

## Spacing Scale

- 基础：4px 子步进，8px 主网格。
- 组件内距：小控件 8-12px，中卡片 20-24px，大模块 32px。
- Section：移动端 56-72px，桌面端 88-112px。
- Container：统一 `max-w-6xl` 或 `max-w-7xl`，两侧 padding 移动端 16px，平板以上 24px。

## Radius / Shadow / Border

- 通用控件：8px。
- 卡片：12-16px；特殊 hero/demo 容器可 20-24px。
- Border：低对比暖灰或浅绿灰，保持边界可见。
- Shadow：默认轻阴影；hover 可增加阴影但不改变尺寸。
- 不使用过重文字阴影；标题依赖字号、字重和间距建立层级。

## Responsive Strategy

- 必测断点：320px、375px、768px、1024px、1440px。
- 移动端优先：避免水平滚动；卡片栅格从 1 列或 2 列逐步升级。
- 表格或宽内容需要 `overflow-x-auto` 包裹。
- 图像使用稳定 aspect-ratio 或 Next Image 尺寸，避免 layout shift。

## Interaction States

- Hover：用颜色、边框、阴影、轻微 transform；transform 不改变文档流尺寸。
- Active：轻微 scale 或 darker surface，持续时间 100-150ms。
- Focus：统一 `focus-visible:ring-2/3`，使用绿色 ring，必须可见。
- Disabled：降低 opacity，保留文字可读性，禁用 pointer。
- Motion：150-300ms；尊重 `prefers-reduced-motion`。

## Loading / Empty / Error

- Loading：使用稳定高度的 skeleton 或柔和 shimmer，避免内容弹跳。
- Empty：使用统一图标容器、标题、说明和可选 CTA。
- Error：保留原错误处理逻辑，只优化错误卡片的视觉层级和恢复入口。

## Accessibility

- icon-only button 必须有 `aria-label`。
- 图片保留准确 `alt`。
- 主内容保留 skip link。
- 可交互元素必须有键盘 focus-visible。
- 文本/背景对比至少满足普通正文 4.5:1。
- 不用颜色作为唯一状态表达。

## 逻辑边界

禁止修改：
- API 请求路径、参数、response 解析。
- 鉴权、权限、路由守卫、middleware。
- server actions、数据库、hooks 业务行为。
- store/reducer/context/zustand/redux 业务含义。
- 表单提交逻辑与 validation schema。
- 删除功能或改变用户操作流程。

允许修改：
- JSX/TSX 展示层结构、className、CSS variables、design tokens、layout、presentational wrapper、视觉状态和可访问性属性。

## 验收 Checklist

- [ ] 主色调仍为绿色/森林绿体系。
- [ ] 基础组件视觉统一。
- [ ] 首页、导航、应用壳层层级更清晰。
- [ ] 移动端无水平滚动。
- [ ] hover 不造成 layout shift。
- [ ] focus-visible 清晰可见。
- [ ] loading/empty/error 与 tokens 对齐。
- [ ] 没有新增依赖。
- [ ] 没有业务逻辑变更。
- [ ] build 通过，test 不新增失败。
