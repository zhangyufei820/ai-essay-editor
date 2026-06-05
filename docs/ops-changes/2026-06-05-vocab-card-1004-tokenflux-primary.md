# 2026-06-05 词镜记忆卡 1004 长 JSON 主路修正

目标：在不改 workflow 结构、不牺牲卡片质量的前提下，把 `词镜记忆卡 / 1004 / 04_AI_生成单词卡片` 的主路修到更快、更稳的企业级区间。

## 结论

`1004` 不适合切去 `sx-general-text`。

对这类“长结构化 JSON 生成”负载，当前最优最小改法是：

- 保持 `1004` 节点模型名仍为 `gpt-5.4-mini`
- 把 `llm-gateway` 中 legacy `gpt-5.4-mini` 的主路顺序修正为：
  - `TokenFlux`
  - `Moonapix`
  - `VivaAPI`

这样不需要改 workflow 结构，也不需要改 Dify 节点模型名，就能让 `1004` 直接吃到更快主路。

## 根因

虽然全站业务别名 `sx-fast-chat` / `sx-general-text` / `sx-image-vision` 已经在 2026-06-05 收到更优主路，但 `词镜记忆卡` 的 `1004` 仍然使用 legacy 模型名 `gpt-5.4-mini`。

而生产 `services/llm-gateway/config.yaml` 里，legacy `gpt-5.4-mini` 当时的 deployment 顺序还是：

1. `VivaAPI`
2. `Moonapix`
3. `TokenFlux`

这和当天已验证的“TokenFlux 才是最快稳定主路”相冲突，导致 `1004` 继续先撞慢链路或被限流链路。

## 同题同环境专项 benchmark

新增脚本：

- `scripts/vocab-card-long-json-benchmark.mjs`

方法：

- 直接读取 `1004` 的真实 prompt 模板
- 用生产同样的 `apple / high / colorful / zh-CN` 变量替换
- 在 `shenxiang-llm-gateway` 容器内，用实际运行时环境做长 JSON 请求
- 校验：
  - JSON 可解析
  - `word / normalized_word = apple`
  - `spelling_formula` 仍能拼回 `apple`
  - `chunk` 不冒充词根/词源
  - 发音字段不误导“双重爆破”

核心对比结果：

- `gateway-gpt-5.4-mini`: `10.77s`
- `direct-tokenflux-gpt-5.4-mini`: `8.25s`
- `gateway-sx-general-text`: `45s` 后超时中止

结论：

1. `sx-general-text` 不适合作为 `1004` 这类长 JSON 生成主路。
2. `TokenFlux gpt-5.4-mini` 明显快于当前 legacy `gpt-5.4-mini` 走到的旧主路。
3. 最值当的是修正 legacy `gpt-5.4-mini` 的 provider 顺序，而不是把 `1004` 改挂到通用文本别名。

## 本次改动

### 1. 网关配置

文件：

- `services/llm-gateway/config.yaml`

修改：

- legacy `gpt-5.4-mini` 改为：
  - `order: 1 -> TokenFlux`
  - `order: 2 -> Moonapix`
  - `order: 3 -> VivaAPI`

并保留 TokenFlux 所需的生产 `User-Agent` 请求头。

### 2. 防漂移测试

文件：

- `__tests__/llm-gateway-config.test.ts`

新增断言：

- legacy `gpt-5.4-mini` 的三段 provider 顺序必须固定为：
  - `deploy-tokenflux-gpt-5-4-mini`
  - `deploy-moonapix-gpt-5-4-mini`
  - `deploy-vivaapi-gpt-5-4-mini`

### 3. 探测速率工具一致性

文件：

- `scripts/provider-direct-benchmark.mjs`

修改：

- TokenFlux 探测请求头改成与生产验证一致的 Codex 风格 `User-Agent`

避免以后探测头和实际请求头不一致，再次误判 TokenFlux 表现。

## 本地验证

```bash
npm test -- __tests__/llm-gateway-config.test.ts
node scripts/vocab-card-long-json-benchmark.mjs --rounds 1 --case=gateway-gpt-5.4-mini --case=direct-tokenflux-gpt-5.4-mini
```

结果：

- gateway 配置测试通过
- legacy `gpt-5.4-mini` 与 TokenFlux 直连的长 JSON 负载差距收敛到同一量级

## 下一步

1. 部署到生产，让 `shenxiang-llm-gateway` 实际加载新顺序
2. 用真实账号重新测：
   - `/chat/vocab-card`
   - 对应 Dify `workflow_node_executions`
3. 重点确认：
   - `1004` 节点耗时下降
   - 首卡展示进一步收紧
   - 不引入质量回退或异常重写路径
