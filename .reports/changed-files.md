# Changed Files

## 本次 UI 重构文件

- `app/globals.css`
- `app/page.tsx`
- `components/app-chrome.tsx`
- `components/header.tsx`
- `components/home/CTASection.tsx`
- `components/home/CapabilitiesSection.tsx`
- `components/home/HeroSection.tsx`
- `components/home/ProcessSection.tsx`
- `components/ui/EmptyState.tsx`
- `components/ui/ErrorState.tsx`
- `components/ui/LoadingStateCard.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/input.tsx`
- `components/ui/select.tsx`
- `components/ui/textarea.tsx`
- `.reports/baseline.md`
- `.reports/design-constraints.md`
- `.reports/implementation-plan.md`
- `.reports/changed-files.md`
- `.reports/logic-integrity-check.md`
- `.reports/ui-ux-pro-max-verification.md`
- `.reports/frontend-design-verification.md`
- `.reports/final-validation.md`
- `.reports/deploy-report.md`

## 非本次改动，未触碰

- `.claude/scheduled_tasks.json`
- `.claude/scheduled_tasks.lock`

上述 `.claude` 改动在接手前已存在，本次未编辑、未回滚、未纳入 UI 重构范围。

## 修改摘要

- 建立更完整的绿色主色扩展 token、surface、border、shadow、focus、container 与 section 工具类。
- 统一 Button/Card/Input/Textarea/Select 的圆角、hover、focus-visible、disabled 与阴影。
- 优化 Header 的 sticky 质感、桌面导航胶囊组、移动菜单、icon button aria。
- 优化 AppChrome 背景 surface。
- 优化首页快捷入口为数据驱动的展示层结构，增强响应式、focus 和 hover。
- 第二轮增强首页 Hero：桌面左文案右演示、移动端单列、降低重阴影、替换首屏 emoji 为 lucide 图标。
- 收敛首页 Capabilities/Process/CTA 的标题、阴影、section 容器和按钮 focus。
- 优化 Empty/Error/Loading 状态组件的视觉层级、主色使用和可访问性。
