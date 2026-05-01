# Codex Sprint 2C 技术指令：Footer / 法务合规 / 客服入口 / 最小测试

## 0. 当前阶段

项目：shenxiang.school（沈翔智学）
本地路径：`/Users/aixingren/ai-essay-editor/`
当前 Sprint：Sprint 2C

Sprint 2 已拆分：
- Sprint 2A：支付/订单/积分 schema 与 API 错误处理 —— 已验收合格
- Sprint 2B：支付状态页 / 支付结果反馈闭环 —— 已验收合格
- Sprint 2C：Footer、隐私政策、服务条款、退款政策、客服入口与最小测试 —— 现在执行

你只执行 Sprint 2C。完成后必须停止，提交中文报告，等待 Hermes 验收。不要进入 Sprint 3。

## 1. 绝对禁止范围

这些限制只针对本项目 `/Users/aixingren/ai-essay-editor/` 的本次 Sprint 2C：

1. 不得部署生产。
2. 不得修改 `.env` / `.env.local` / `.env.production`。
3. 不得硬编码任何密钥、token、password、API key、connection string。
4. 不得创建、修改、删除 `services/essay-ai-suite/**`。
5. 不得创建或修改任何 1Panel 应用、1Panel app 包、release tar.gz。
6. 不得修改 `.github/workflows/**`。
7. 不得做 Docker、镜像、部署、CI/CD、服务打包相关工作。
8. 不得删除支付、订单、积分、用户、会员核心逻辑来通过构建。
9. 不得开启 Sprint 3。
10. 不得提交 git commit，不得 git push。

如果发现上述范围需要改动，立刻停止并在报告里说明，不要自作主张。

## 2. 本 Sprint 目标

把网站最小商业合规闭环补齐，让用户在任何主入口都能清楚找到：

- 隐私政策 `/privacy`
- 服务条款 `/terms`
- 退款政策 `/refund-policy`
- 客服入口：`support@shenxiang.school`，必要时保留客服电话 `19132896773`
- 支付/退款/权益说明

同时补最小测试，防止未来 Footer 或合规链接再次缺失。

## 3. 推荐可改文件范围

优先只改这些文件：

- `components/footer.tsx`
- `components/home/Footer.tsx`
- `components/home/HomeFooter.tsx`
- `app/privacy/page.tsx`
- `app/terms/page.tsx`
- `app/refund-policy/page.tsx`
- `__tests__/legal-footer.test.tsx` 或类似新测试文件

如确需新增轻量工具函数，可以新增在 `lib/`，但必须说明原因。

## 4. 具体任务

### 4.1 Footer 三套组件统一补齐链接

项目当前存在多个页脚组件，必须全部检查：

- `components/footer.tsx`
- `components/home/Footer.tsx`
- `components/home/HomeFooter.tsx`

要求：

1. 不能存在 `href="#"` 死链接。
2. 三套 Footer 至少都能访问：
   - `/privacy` 隐私政策
   - `/terms` 服务条款 / 用户协议
   - `/refund-policy` 退款政策
   - `/help` 或 `mailto:support@shenxiang.school` 联系客服 / 帮助中心
   - `/pricing` 价格方案
3. 如果某个 Footer 有“联系我们”，建议改为 `mailto:support@shenxiang.school` 或保留 `/help` 但文案旁边应能找到客服邮箱。
4. 版权年份保持 2026 或动态年份均可，但不要回退。
5. 不要引入复杂新 UI，不要大改视觉风格。

### 4.2 隐私政策页补齐商业必备信息

文件：`app/privacy/page.tsx`

要求在现有页面基础上补齐或明确：

1. 数据收集类型：账户、使用记录、订单/支付状态、客服沟通记录。
2. 数据用途：提供服务、订单处理、积分到账、客服支持、安全风控。
3. 用户权利：访问、更正、删除、注销、导出。
4. 行使权利的客服邮箱：`support@shenxiang.school`。
5. 不要声称已具备未实现的复杂功能，例如“后台一键导出全部数据”除非代码已有。

### 4.3 服务条款页补齐支付与权益说明

文件：`app/terms/page.tsx`

要求在现有页面基础上补齐或明确：

1. 付费服务说明：价格、积分、会员权益以 `/pricing` 与结账页展示为准。
2. AI 输出说明：AI 结果仅供学习参考，不能保证完全正确，用户需自行判断。
3. 支付成功后权益到账说明：以订单状态和账户积分/会员状态为准。
4. 退款相关应链接到 `/refund-policy`。
5. 客服邮箱：`support@shenxiang.school`。
6. 修正明显不自然表述，例如英文 `uninterrupted` 混入中文句子。

### 4.4 退款政策页补齐支付闭环说明

文件：`app/refund-policy/page.tsx`

要求在现有页面基础上补齐或明确：

1. 退款申请必须提供：账号信息、订单号、支付凭证或支付时间。
2. 已使用积分、已消耗服务、恶意滥用等情况可能影响退款。
3. 退款处理周期：审核 1-3 个工作日，原路退回通常 3-5 个工作日，具体以支付渠道为准。
4. 支付成功但权益未到账：提醒不要重复支付，联系 `support@shenxiang.school` 并提供订单号。
5. 页面底部必须有 `/privacy`、`/terms`、`/pricing`、客服入口。

### 4.5 补最小测试

新增或修改测试，建议文件：`__tests__/legal-footer.test.tsx`

测试目标：

1. Footer 源码中不应出现 `href="#"`。
2. 三套 Footer 或核心 Footer 文件中应包含 `/privacy`、`/terms`、`/refund-policy`。
3. 法务页面源码中应包含 `support@shenxiang.school`。
4. `/refund-policy` 页面源码中应包含订单号或支付凭证相关说明。

测试可以是轻量级源码文本测试，不要求浏览器端 E2E。

## 5. 验收前请你自己运行

如果本地依赖可用，完成后请运行：

```bash
npm run lint
npm run build
npm test -- --runInBand __tests__/legal-footer.test.tsx
```

如果新增测试文件名不同，请运行对应测试。

注意：不要把 `npm run build` 与 Jest 并行跑；构建会改写 `.next`。

## 6. 完成报告格式（必须中文）

完成后停止，并输出中文报告，包含：

1. 修改了哪些文件。
2. 每个文件解决了什么问题。
3. 执行了哪些命令，结果如何。
4. 是否触碰禁止范围：必须明确回答“没有”。
5. 是否发现风险或遗留问题。
6. 明确说明：Sprint 2C 已完成，等待 Hermes 验收；未进入 Sprint 3。
