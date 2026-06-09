# 2026-06-09 网关过滤放宽与数学智能体超时加固

目标：减少教育场景误判，同时降低数学智能体因上游流式读超时导致用户无响应的概率。

## 修复内容

- `services/llm-gateway/config.yaml`
  - `sx-global-sensitive-content` 保留 default-on。
  - 内置分类只保留 `harmful_illegal_weapons`。
  - 移除 `harmful_violence`，避免普通教育提示词被误判。
- `services/llm-gateway/guardrails/blocked-words.yaml`
  - 关键词只保留色情和枪支。
  - 明确移除暴力、血腥、毒品、国家领导人和政治关键词。
- `app/api/dify-chat/route.ts`
  - `quanquan-math` 强制使用 Dify blocking 调用，并在 Next.js 侧包装成 SSE 返回给前端。
  - 目的：避开长输出链路中 Dify 到前端的流式中途断读，把失败面收窄到一次完整上游响应。
- `__tests__/llm-gateway-config.test.ts`
  - 固定网关只拦截色情和枪支。
- `__tests__/all-in-one-route-model.test.ts`
  - 固定数学智能体进入显式 blocking 兜底集合。

## 策略边界

当前网关级关键词过滤只负责最容易造成产品风险的两类：

- 色情
- 枪支

暴力、血腥、毒品、国家领导人和政治词不再作为网关级关键词拦截。若某个具体应用后续需要更严格审核，应在该应用自己的业务规则中处理，不应重新扩大全站网关关键词。

## 验证

部署前需执行：

```bash
npm test -- __tests__/llm-gateway-config.test.ts __tests__/all-in-one-route-model.test.ts
npm run build
```

部署后需验证：

- `https://shenxiang.school/api/health` 返回 `status: ok`。
- `shenxiang-llm-gateway` 容器 liveliness / readiness 正常。
- 包含“暴力”的普通教育提示词不再被关键词误拦。
- 包含“色情”和“枪支”的提示词仍被网关拦截。
- `/chat/quanquan-math` 通过 Next.js API 返回 `X-Dify-Response-Mode: blocking`。
