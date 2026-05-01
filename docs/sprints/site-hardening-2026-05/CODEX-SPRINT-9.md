# CODEX Sprint 9 — 静态图片 no-img-element 清理（第一批）

## 背景

Sprint 8 已完成低风险 lint warning 清理，基线验证通过：

- `npm test -- --runInBand`：26/26 suites passed，140/140 tests passed。
- `npm run build`：成功。
- `npm run lint`：剩余 47 warnings，其中：
  - 31 个 `@next/next/no-img-element`
  - 16 个 `react-hooks/exhaustive-deps`

进入 Sprint 9 前重新验收：测试、构建、生产核心路径均通过。

## Sprint 9 目标

只处理低风险、静态/营销区域的图片标签，避免一次性替换所有 `<img>` 造成外链域名、用户上传图、聊天内容、支付二维码等行为变化。

本批清理 6 个 `@next/next/no-img-element`：

1. `components/home/HomeFooter.tsx`：页脚品牌 logo。
2. `components/home/Footer.tsx`：桌面端/移动端页脚品牌 logo。
3. `components/home/CTASection.tsx`：首页 CTA 静态主图。
4. `app/help/page.tsx`：帮助页客服二维码静态图。
5. `app/invite/page.tsx`：邀请页头部品牌 logo。

## 明确不做

- 不处理 `react-hooks/exhaustive-deps`，hooks 单独开 Sprint 审计。
- 不处理聊天消息、用户上传图片、模型生成图、外链 markdown 图片。
- 不处理支付二维码页、用户头像、设置页头像等动态图片。
- 不修改支付、订单、积分、会员、后台认证、环境变量相关逻辑。

## 改动摘要

- 将上述静态 `<img>` 改为 Next.js `<Image>`。
- 为固定展示 logo/二维码补充 `width` / `height`。
- 为 CTA 背景图使用 `fill` + `sizes`，保持原有 `object-cover` 和容器比例。
- 保持原有链接、文案、交互动效不变。

## 验收结果

### lint

```text
npm run lint
✖ 41 problems (0 errors, 41 warnings)
```

对比 Sprint 8：

- 总 warnings：47 -> 41
- `@next/next/no-img-element`：31 -> 25
- `react-hooks/exhaustive-deps`：16 -> 16（本 Sprint 不处理）

### tests

```text
npm test -- --runInBand
Test Suites: 26 passed, 26 total
Tests:       140 passed, 140 total
```

### build

```text
npm run build
✓ Compiled successfully
✓ Generating static pages using 7 workers (64/64)
```

### diff / scope

```text
app/help/page.tsx              | 5 ++++-
app/invite/page.tsx            | 3 ++-
components/home/CTASection.tsx | 9 +++++----
components/home/Footer.tsx     | 9 +++++++--
components/home/HomeFooter.tsx | 6 +++++-
5 files changed, 23 insertions(+), 9 deletions(-)
```

范围符合 Sprint 9：仅静态图片迁移，不触碰核心业务逻辑。

### secret scan

changed diff 密钥扫描无命中。

## 后续建议

下一批仍建议继续按风险分层处理 `@next/next/no-img-element`：

1. `components/ModelLogo.tsx` 本地 svg logo，可评估迁移。
2. `components/navigation/MobileNav.tsx`、`app/settings/page.tsx` 用户头像属于动态图，需确认远程域名和尺寸后再处理。
3. `app/payment/wechat/[orderNo]/page.tsx` 支付二维码建议单独处理/验证，不与营销页混做。
4. 聊天消息、markdown、用户上传、模型生成图最后处理，必要时保留 `<img>` 并加局部 eslint disable，比强行迁移更安全。
