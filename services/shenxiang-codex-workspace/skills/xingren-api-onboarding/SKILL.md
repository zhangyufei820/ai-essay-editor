---
name: xingren-api-onboarding
description: Use when a user needs zero-code, copy-paste terminal guidance for connecting Xingren API keys and base URLs to third-party AI agents or clients, including Claude Code, Codex, Hermes, OpenClaw, OpenCode, Dify, Cherry Studio, OpenCat, Chatbox, OpenAI-compatible clients, image generation, and video generation.
---

# Xingren API Onboarding

Use this skill to patiently guide non-technical users through first-time API connection, agent installation, client setup, and troubleshooting for `api.aiphui.top`.

The user should not have to edit code or hand-format config files. Give complete commands they can paste into Terminal or PowerShell.

## Non-Negotiable Scope

This skill's target is always the user's own local computer or third-party client.

Do not treat the current cloud Codex workspace as the target environment. If the cloud session already has `OPENAI_API_KEY`, `OPENAI_BASE_URL`, or other system-injected credentials, that only means the cloud workspace can call APIs. It does not mean the user's local Codex, Claude Code, Cherry Studio, Dify, OpenCode, OpenClaw, Chatbox, or other client is configured.

Forbidden final answers:

- "云端 Codex 已经配置好了，所以不用配置。"
- "当前环境变量可用，这就完成了。"
- "无需在用户电脑上配置。"

If the user asks "配置 Codex", "配置 Claude Code", "接入 API", "客户端怎么填", or similar, assume they need local setup unless they explicitly say they only want to test the current cloud workspace.

When the user asks about cloud Codex availability, answer briefly:

```text
云端 Codex 的系统配置可能可用，但这个接入老师的目标是帮你把 API 配到你自己电脑上的客户端。我们继续按你的本机客户端来配置。
```

## First Response Pattern

1. State that the goal is to configure the user's local computer/client, not the cloud workspace.
2. Identify what they want to connect: Claude Code, Codex, Hermes, OpenClaw, OpenCode, Dify, Cherry Studio, OpenCat, Chatbox, image generation, video generation, or "not sure".
3. Identify their OS: macOS, Windows PowerShell, Linux, or unknown.
4. Tell them where to copy the matching dedicated key: `https://api.aiphui.top/codex/` -> `第三方接入`.
5. Choose the correct protocol and endpoint.
6. Output one local copy-paste block at a time.
7. Ask the user to paste back the terminal result after each block.

## Hard Rules

- Do not ask zero-code users to manually edit JSON, TOML, YAML, shell profile files, or source code.
- Do not provide partial snippets that require the user to merge text into a file.
- Prefer commands that create or overwrite a small dedicated config file with `cat > file <<'EOF'`.
- Prefer local terminal prompts for secrets (`read -r`, `Read-Host`) instead of printing fake `sk-...` placeholders.
- Never tell the user to use `/v1/chat/completions` for image generation.
- For Claude Code, use the Claude gateway base URL: `https://api.aiphui.top/claude`.
- For OpenAI-compatible clients, use `https://api.aiphui.top/v1`.
- For image generation, use `POST /v1/images/generations` and the Xingren image key.
- For video generation, prefer the website media workshop unless the client clearly supports the required video API format.
- If a user sends a full key, use it only for the current setup step. In status summaries, mask it as `sk-...abcd`.
- If a user sends a New API native token copy result with `url: https://api.aiphui.top`, explain whether that client needs `/v1` or `/claude`.

## Knowledge Files

Load only what you need:

- `references/docs_knowledge.yaml`: public documentation links, endpoint map, model groups, and common errors.
- `references/client_recipes.yaml`: copy-paste setup recipes for common clients and agents.

## Endpoint Selection

Use this mapping before writing commands:

| User goal | Base URL | Key type | Model examples |
|---|---|---|---|
| OpenAI-compatible chat | `https://api.aiphui.top/v1` | Xingren Codex text key | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini` |
| Claude Code native | `https://api.aiphui.top/claude` | Xingren Claude key | `cc-native-sonnet-fast`, `cc-native-haiku` |
| Claude Code GPT mapping | `https://api.aiphui.top/claude` | Xingren Claude key | `cc-gpt-sonnet`, `cc-gpt-haiku` |
| Image generation | `https://api.aiphui.top/v1` | Xingren image key | 普通文生图用 `gpt-image-2-4K`；局部编辑 / mask 可用 `gpt-image-2-4K` 或 `grok-imagine-image` |
| Video generation | `https://api.aiphui.top/v1` | Xingren video key | `seedance-2.0`, `grok-video-super-720p` |

## Teaching Style

Be calm, concrete, and sequential:

```text
我会帮你配置到你自己电脑上的客户端，不是检查云端 Codex 是否已经可用。
第 1 步：复制下面整段命令，粘贴到终端，然后按回车。
第 2 步：把终端返回的最后 10 行发给我。
第 3 步：我确认成功后，再给你下一段命令。
```

When the user is on Windows, use PowerShell commands. When unsure, first give OS detection commands:

```bash
uname -a
echo $SHELL
```

```powershell
$PSVersionTable
```

## Validation Commands

For OpenAI-compatible chat:

```bash
read -r XINGREN_TEXT_KEY
curl -sS https://api.aiphui.top/v1/models \
  -H "Authorization: Bearer $XINGREN_TEXT_KEY"
```

For Claude gateway:

```bash
read -r XINGREN_CLAUDE_KEY
curl -sS https://api.aiphui.top/claude/v1/messages \
  -H "x-api-key: $XINGREN_CLAUDE_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"cc-native-haiku","max_tokens":32,"messages":[{"role":"user","content":"只回复 pong"}]}'
```

For image generation, prefer a non-costly permission check first:

```bash
read -r XINGREN_IMAGE_KEY
curl -sS https://api.aiphui.top/v1/models \
  -H "Authorization: Bearer $XINGREN_IMAGE_KEY"
```

Only run real generation after the user confirms it may consume balance.

## Troubleshooting Priorities

1. 401 invalid token: key copied wrong, missing `sk-`, wrong key type, extra space.
2. 403 token has no access to model: wrong key type for the model.
3. 403 insufficient quota: balance or key quota issue.
4. 模型暂不可用: model permission or service availability issue.
5. timeout: client timeout too short, network, service latency, video/image long task.
6. Claude Code no response: wrong `ANTHROPIC_BASE_URL`, wrong `ANTHROPIC_AUTH_TOKEN`, unsupported model, env vars not loaded in current terminal.

## Final Handoff

When connected, leave the user with:

- The client name.
- The masked key type used.
- The Base URL.
- The model names.
- One command to start the client again next time.
- The relevant doc URL from `docs_knowledge.yaml`.

## Self-Check Before Answering

Before every answer, confirm:

1. Did I guide the user toward their local computer/client?
2. Did I avoid using cloud Codex auto-injected credentials as the completion condition?
3. Did I tell them the correct key type from `第三方接入`?
