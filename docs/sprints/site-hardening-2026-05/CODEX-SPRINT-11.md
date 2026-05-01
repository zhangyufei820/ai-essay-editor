# CODEX Sprint 11 — 动态图片 no-img-element 风险封存

日期：2026-05-01

## 背景

Sprint 10 后 lint 剩余 38 个 warning：

- `@next/next/no-img-element`: 22 个
- `react-hooks/exhaustive-deps`: 16 个

本 Sprint 只处理剩余 22 个 `<img>` warning。经逐项审计，它们不属于低风险静态资源，而是以下高风险/动态图片面：

- 微信支付二维码：支付链接二维码尺寸、白底和识别率敏感。
- 用户头像：来自用户资料/第三方登录/上传，URL 形态不稳定。
- 用户上传预览：blob/object URL、本地文件 preview。
- 聊天消息图片：用户上传、Markdown 外链、代理后的生成图、OpenClaw 生成图。
- 模型生成结果：动态代理 URL、下载 URL、宽高不固定。
- 音乐封面：外部/生成资源，动画样式依赖原生图片行为。

直接替换为 `next/image` 会引入尺寸、domain、loader、blob/data URL、代理 URL、布局和支付二维码识别风险。因此本 Sprint 的目标是：**显式标注这些位置为何继续使用原生 `<img>`，消除误导性 lint 噪音，不改变任何渲染/业务行为。**

## 范围

为以下 16 个文件添加文件级 ESLint 豁免说明：

- `app/payment/wechat/[orderNo]/page.tsx`
- `app/settings/page.tsx`
- `components/app-sidebar.tsx`
- `components/chat/ChatInput.tsx`
- `components/chat/EnhancedMarkdown.tsx`
- `components/chat/FilePreview.tsx`
- `components/chat/MessageBubble.tsx`
- `components/chat/MusicCard.tsx`
- `components/chat/OpenClawHtmlPreview.tsx`
- `components/chat/UserMessageBubble.tsx`
- `components/chat/banana-chat-interface.tsx`
- `components/chat/enhanced-chat-interface.tsx`
- `components/chat/gpt-image2-chat-interface.tsx`
- `components/chat/image-generation/image-chat-composer.tsx`
- `components/essay-grader.tsx`
- `components/navigation/MobileNav.tsx`

## 改动方式

每个文件只新增 1 行文件级说明：

```ts
/* eslint-disable @next/next/no-img-element -- Dynamic/user-generated/external image surfaces: keep native img to preserve sizing, blob/data/proxy URLs, payment QR codes, and chat preview behavior. */
```

未修改任何 JSX 属性、业务逻辑、图片 URL、尺寸、className、loading、下载链接或支付轮询逻辑。

## 验证结果

- `npm run lint`: 通过，0 errors，16 warnings。
  - `@next/next/no-img-element`: 22 → 0。
  - `react-hooks/exhaustive-deps`: 16 保持不动。
- `npm test -- --runInBand`: 通过。
  - 26/26 test suites passed。
  - 140/140 tests passed。
- `npm run build`: 通过。
- changed diff secret scan: 未发现实际密钥值。

## 风险控制

- 没有把动态/用户生成/支付二维码图片强行迁移到 `next/image`。
- 没有触碰支付创建、支付回调、支付状态轮询和积分逻辑。
- 没有触碰聊天会话加载、消息发送、模型生成、上传和下载逻辑。
- 没有处理 hooks warning，避免改变 effect 执行时机、请求次数和会话状态。

## 当前剩余 lint warning

只剩 16 个 `react-hooks/exhaustive-deps` warning。建议后续单独开 Sprint，按 effect 逐个审计，不要批量自动加 dependency。
