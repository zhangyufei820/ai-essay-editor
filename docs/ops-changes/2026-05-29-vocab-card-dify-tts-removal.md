# 2026-05-29 vocab-card Dify TTS removal

- Scope: Dify workflow graph only; no frontend or Next.js source behavior changed.
- App: 词镜记忆卡 (`7aa60548-0cfc-4688-a345-a7e37f234d63`).
- Workflows updated: published `59f82a10-bd32-4edb-9c2f-e05b3d005435`, draft `b5f1eeec-58f2-4dce-a004-8b94e153d563`.
- Backup on server: `/data/ai-essay-editor-backups/vocab-card-workflows-before-tts-removal-20260529183118.jsonl`.
- Removed TTS HTTP nodes: `1021` and `1031`, both previously called `https://www.shenxiang.school/api/voice/tts` and could return 401.
- Rewired edges: `1020 -> 1022` and `1030 -> 1032`, preserving final frontend card generation while disabling audio generation.
- Updated merge code nodes `1022` and `1032` to set `tts_status=disabled` and `audio_url=""` instead of treating missing TTS as a failed workflow.
- Switched remaining `gpt-5.4` LLM nodes in this workflow to `gpt-5.4-mini`; all LLM nodes are now OpenAI-compatible `gpt-5.4-mini`.

Verification:
- Production real-account request `verify-vocab-1780050996848` returned HTTP 200 in 34.2s.
- Dify workflow run `2f7f61a5-f737-46ba-9d76-8ccada228d58` succeeded in 29.13s with 18 steps.
- Previous comparable run was partial-succeeded in 83.14s with 21 steps and TTS HTTP 401.
- Latest node executions contain no `http-request` node and no TTS 401.
