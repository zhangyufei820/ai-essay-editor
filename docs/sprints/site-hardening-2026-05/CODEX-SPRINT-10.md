# CODEX Sprint 10 — Model Logo / Sidebar Logo Image Migration

## 背景

Sprint 9 后，站点 lint 仍有 41 个 warning：

- `@next/next/no-img-element`: 25
- `react-hooks/exhaustive-deps`: 16

本 Sprint 延续 Sprint 9 的低风险策略，只处理本地静态 logo 图片，不处理支付二维码、聊天消息、用户上传图、模型生成图、markdown 外链图，也不处理 hooks warnings。

## 范围

本次处理 3 个低风险 `<img>`：

1. `components/ModelLogo.tsx`
   - `ModelLogo` 的本地 SVG 模型 logo。
   - `ModelLogoWithBg` 的本地 SVG 模型 logo。
   - 这些路径来自 `MODEL_LOGOS` 的本地 `/logos/*.svg` 配置，尺寸由 `LOGO_SIZES` 控制。

2. `components/app-sidebar.tsx`
   - 侧边栏顶部本地品牌 logo `/images/design-mode/home-logo-transparent.png`。
   - 保留原 `maxWidth: 160px` 与 `w-full h-auto object-contain` 展示行为。

## 明确不处理

- `app/payment/wechat/[orderNo]/page.tsx` 支付二维码：支付流程独立 Sprint。
- `app/settings/page.tsx` 用户头像：用户上传/外链，暂不迁移。
- `components/app-sidebar.tsx` 用户头像：用户上传/外链，暂不迁移。
- `components/navigation/MobileNav.tsx` 用户头像：用户上传/外链，暂不迁移。
- `components/essay-grader.tsx` 文件预览：用户本地上传预览，暂不迁移。
- `components/chat/**` 聊天、markdown、模型生成图、文件预览：行为复杂，暂不迁移。
- 所有 `react-hooks/exhaustive-deps`：单独 Sprint 审计。

## 改动

- `components/ModelLogo.tsx`
  - 引入 `next/image`。
  - 将两个本地 SVG `<img>` 迁移为 `<Image>`。
  - 使用 `width={sizeConfig.iconSize}` / `height={sizeConfig.iconSize}`，保留原 className。
  - `ModelLogo` 纯 logo 分支保留 eager 语义，使用 `priority`。

- `components/app-sidebar.tsx`
  - 引入 `next/image`。
  - 将侧边栏品牌 logo 迁移为 `<Image>`。
  - 使用 `width={160}` / `height={40}`，保留原 className/style。
  - 使用 `priority`，避免首屏侧边栏品牌图延迟。

## 验证

执行命令：

```bash
npm run lint
npm test -- --runInBand
npm run build
git diff --stat
git diff --no-ext-diff --unified=0 | grep -E -i 'eyJhbGci|sb_secret_|sk_live|sk_test|service_role|SUPABASE_SERVICE_ROLE|appSecret|APPSECRET|private key' || true
```

结果：

- `npm run lint`: 通过，0 errors，38 warnings。
  - `@next/next/no-img-element`: 25 -> 22。
  - `react-hooks/exhaustive-deps`: 保持 16。
- `npm test -- --runInBand`: 26/26 suites passed，140/140 tests passed。
- `npm run build`: 通过。
- 密钥扫描：无命中。

## 风险评估

低风险：

- 只处理本地静态资源；
- 不改业务逻辑；
- 不改支付、订单、积分、会员、后台认证、环境变量；
- 不改用户上传/外链图/聊天图；
- 不改 hooks dependency，避免改变 effect 执行时机。

## 后续建议

剩余 `no-img-element` 主要集中在支付二维码、用户头像、聊天/markdown/模型生成图、用户上传预览。建议：

1. 支付二维码单独 Sprint，做支付页视觉和二维码识别回归。
2. 用户头像/上传预览谨慎评估是否迁移；必要时局部 eslint disable 更安全。
3. 聊天/markdown/模型生成图最后处理，不要强行全局替换。
4. hooks warnings 单独开 Sprint 逐个 effect 审计。
