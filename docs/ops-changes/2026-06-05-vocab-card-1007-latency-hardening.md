# 2026-06-05 词镜记忆卡 1007 质检节点提速与防漂移

目标：在不改 workflow 结构、不牺牲卡片质量的前提下，继续压缩 `词镜记忆卡` 的真实用户耗时，并加固脚本，避免 prompt 累积漂移。

## 本次改动

1. `scripts/dify-tune-vocab-card.mjs`
   - 将 `1007 / 07_AI_质检卡片` 的 `max_tokens` 从 `768` 收紧到 `384`
   - 将 `1007` 的通过态约束收紧为“最短裁决”
     - 可直接展示时输出 `issues = []`
     - 通过态 `summary_cn` 固定为短句
     - 仅对真实影响学习结果/展示安全的问题保留 `issues`
   - 新增 `PROMPT_BLOCK_MARKERS`
     - 对 `1007` 的“企业级质检提速约束 / 提速要求”执行覆盖式更新
     - 避免脚本重复运行时不断把同一段 prompt 追加进去，导致 prompt 漂移变胖

2. 生产 workflow 已同步
   - published: `59f82a10-bd32-4edb-9c2f-e05b3d005435`
   - draft: `b5f1eeec-58f2-4dce-a004-8b94e153d563`

## 生产备份

- `codex-vocab-card-tune-20260605145752`
- `codex-vocab-card-tune-20260605150208`

## 关键验证

### 防漂移

命令：

```bash
node scripts/dify-tune-vocab-card.mjs
```

结果：

- `planned_changes: 0`
- 说明线上 published / draft 已与脚本一致

### 真实账号前端复测

命令：

```bash
node scripts/production-chat-latency.mjs --slug=vocab-card
```

对比：

- 旧稳定样本：
  - `first_render: 6911ms`
  - `stream_end: 20102ms`
- 本次最终样本：
  - `first_render: 6889ms`
  - `stream_end: 17897ms`
  - marker: `GW-AUDIT-1780671749552-vocab-card`

结论：

- 首卡展示保持在约 `6.9s`
- 整段流结束进一步缩短到约 `17.9s`

### Dify 节点级复测

命令：

```bash
node scripts/dify-workflow-latency-audit.mjs --marker GW-AUDIT-1780671749552-vocab-card
```

关键结果：

- run id: `ec0a3e30-1f54-4a0c-bab4-c2b6a150fbb8`
- Dify 总耗时：`14.886857s`
- 慢节点：
  - `1004 / 04_AI_生成单词卡片`: `7.10107s`
  - `1101 / 01_AI_对话理解与学习意图判断`: `4.307583s`
  - `1007 / 07_AI_质检卡片`: `1.891067s`

`1007` 本次输出：

- `issues = []`
- `summary_cn = "通过，可直接展示。"`
- 未触发重写路径

`1007` token 情况：

- `prompt_tokens: 1766`（上一版异常膨胀样本曾到 `1766`，本次已通过脚本去重逻辑防止后续继续累积）
- `completion_tokens: 62`
- `time_to_generate: 0.062s`

结论：

- `1007` 已从“长篇低价值建议”收成“短裁决节点”
- 本轮真实拖尾不再来自 `1007`
- 当前最大波动源仍是 `1004`

## 发现的根因与加固结论

1. `1007` 原先并不是真的“必须慢”，而是会为通过态输出过多低价值建议。
2. 脚本此前对 prompt 采用单纯追加策略，重复运行会让 `1007` prompt 逐渐变长，形成隐性性能漂移。
3. 现在已改为按 marker 覆盖更新，同一段约束不会重复叠加。

## 下一步建议

1. 继续收 `1004`
   - 当前仍是第一大慢点
   - 重点看其偶发 `time_to_first_token` 抖动与长结构化 JSON 输出抖动
2. 若要把 `词镜记忆卡` 进一步收成“企业级快稳”
   - 优先继续做 `1004` 的同题同环境模型/路由复测
   - 考虑为“长结构化 JSON 生成”单独设快路，而不是只沿用通用 `gpt-5.4-mini`
