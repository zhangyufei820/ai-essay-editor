# 2026-05-29 all-in-one-agent Dify model switch

- Scope: Dify workflow graph only; no frontend or Next.js source behavior changed.
- App: 数学图片与动画生成器（Codex Gateway）-Chatflow稳定启动v3.
- Workflows updated: draft `63ba09dc-760e-4907-a903-afa2c17a20ed`, published `29ee9f4c-4784-4c9e-af1a-c9266d875299`.
- Change: `image_recognizer_node` model changed from `gemini-3.1-flash-lite-preview` to `gpt-5.4-mini`.
- Reason: production Dify worker failed with `gemini-3.1-flash-lite-preview 无可用渠道` at `image_recognizer_node`.
- Backup on server: `/data/ai-essay-editor-backups/all-in-one-agent-workflows-before-model-switch-20260529181824.jsonl`.
- Verification: real-account production request `verify-allinone-1780049973659` returned HTTP 200 in 24.9s; no new `PluginInvokeError` or old model error appeared in logs.

Slow-path finding:
- Slow apps are bottlenecked inside Dify workflow nodes, not frontend routing or Next.js proxying.
- Examples from `workflow_runs` / `workflow_node_executions`: writing skill route LLM nodes using `openclaw` ran 273.9s and 300.6s; Gemini Pro single LLM node ran 78.8s; vocab-card chains multiple LLM nodes plus a TTS HTTP 401 on the repair path.
