# Implementation Plan

负责人：frontend-design

## 目标

根据 `.reports/design-constraints.md` 做保守 UI 重构，只修改展示层结构、样式、design tokens、组件视觉状态与可访问性属性，不改变任何业务逻辑。

## Chosen Aesthetic Direction

`calm academic clarity`：保留森林绿主色，减少视觉噪声，用更稳定的卡片、控件、标题尺度和状态反馈提升教育产品的可信赖感。

## 执行批次

1. 全局 tokens 与基础样式
   - 收敛 `app/globals.css` 中的绿色、背景、边框、focus、shadow、section/container tokens。
   - 增加通用 surface、focus、reduced motion 和布局工具类。

2. 通用组件
   - 优化 Button、Card、Input、Textarea、Select 的圆角、focus-visible、hover、disabled、shadow 和状态一致性。
   - 优化 EmptyState、ErrorState、LoadingStateCard 的视觉层级与可访问性。

3. 页面骨架与导航
   - 优化 `components/header.tsx` 的 sticky header、导航 hover/focus、移动菜单和 icon button aria。
   - 优化 `components/app-chrome.tsx` 主内容背景与宽度稳定性。

4. 首页核心页面
   - 优化 `app/page.tsx` 快捷入口区卡片层级、响应式和 focus。
   - 优化首页关键 section 的标题阴影、卡片统一、间距、状态反馈。

5. 验证与报告
   - 运行 diff/stat、test/build。
   - 生成 `changed-files.md`、`logic-integrity-check.md`、两份技能验收报告、`final-validation.md` 和 `deploy-report.md`。

## 不做事项

- 不修改 API、hooks、auth、middleware、server actions、数据库、store、validation schema。
- 不引入新依赖。
- 不删除功能、不改变路由和用户操作流程。
