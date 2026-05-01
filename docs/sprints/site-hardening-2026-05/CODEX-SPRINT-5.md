# Codex Sprint 5 技术指令：支付、积分、会员链路复核

项目：shenxiang.school / ai-essay-editor
路径：`/Users/aixingren/ai-essay-editor/`

## 当前前置状态

- Sprint 0/1：已验收合格
- Sprint 2A：已验收合格
- Sprint 2B：已验收合格
- Sprint 2C：已验收合格
- Sprint 3：已验收合格
- Sprint 4：已验收合格

前序 Sprint 的变更可能仍未提交，因此会继续出现在 `git status` 中；本 Sprint 只关注支付、积分、会员链路的最小加固。

## Sprint 5 目标

复核并加固真实付费闭环：

1. 创建支付订单时，服务端产品目录必须是价格和积分数量的唯一来源。
2. 支付回调必须拒绝签名失败，不能继续发放积分。
3. 支付回调必须校验支付金额、产品积分、会员产品身份。
4. 订单必须在权益处理成功后再更新为 paid，并使用 pending 条件保证重复回调幂等。
5. 不部署、不提交、不进入 Sprint 6。

## 验收标准

- 新增或修改测试覆盖支付创建、支付回调、产品目录 helper。
- `npm test -- --runInBand __tests__/payment-guards.test.ts` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- 最终汇报 diff 范围、验证结果、未完成项。
