# Codex Task Router

This file is the mandatory task router for local Codex work in this repository and for cloud Codex task workspaces. It exists to prevent repeated scope drift between the main site, isolated New API, cloud Codex, and other projects.

## Required Opening

Before editing files, deploying, querying production data, or running high-risk commands, Codex must produce this routing card:

```text
scope_lock:
target_stack:
target_paths:
forbidden_paths:
evidence_first:
done_card:
verification:
cleanup:
```

If the scope is ambiguous, make the safest narrow assumption and say it. Ask only when the task cannot be safely routed.

## Multi-Agent Coordination Rule

This rule applies to all conversations in this repository, not only repair work. When the user says `紧急修复`, `监督`, `多 agent`, `多线程协作`, `不要开多个窗口`, `不要另开线程`, `统一协调`, or expresses the same intent, Codex must default to sub-agents inside the current thread instead of creating new user-visible Codex threads.

- The current thread is the coordinator. It owns scope locking, decomposition, conflict control, final decisions, commit/deploy choices, and the final user report.
- Do not create a new user-visible Codex thread by default. Create one only when the user explicitly asks for a new thread, new window, or Codex thread.
- Sub-agent tasks must be specific, non-duplicative, and verifiable. For code-writing subtasks, assign mutually exclusive write scopes so agents do not edit the same files or modules in parallel.
- Include at least one read-only monitor for production state, logs, read-only DB evidence, health checks, or user-path monitoring when the task involves production, urgent incidents, supervision, or runtime verification. This monitor must not edit files, restart services, write DB rows, or deploy.
- The coordinator must keep moving on the critical path and must not offload the blocking root decision to a sub-agent and then idle.
- All sub-agent findings must return to the coordinator for review and synthesis. The final report to the user must be written only by the coordinator thread.
- If the task is too small to justify spawning a sub-agent, the coordinator must state why no sub-agent was started, while still avoiding new user-visible threads.

## Scope Locks

### Main Site

Use when the user says `shenxiang.school`, `主站`, main site, website apps, Dify app stats, Supabase task traces, payments, credits, or production traffic for the school site.

- target_stack: main site Next.js
- local_paths: `app/**`, `components/**`, `lib/**`, `scripts/**`, `docs/**`
- production_path: `/data/ai-essay-editor`
- health: `https://shenxiang.school/api/health`
- evidence_first: `shenxiang-openresty` logs, `ai_task_runs`, `credit_transactions.billing_metadata`, `shenxiang-nextjs` logs, Dify raw answer or SSE traces
- forbidden_paths: `/opt/shenxiang-new-api`, isolated New API MySQL/Redis, cloud Codex runtime unless explicitly requested

### Isolated New API

Use when the user says `new api`, `api.aiphui.top`, media playground, media factory, monthly card, relay channel, provider monitor, token billing, model limits, or New API users.

- target_stack: isolated New API
- local_paths: `services/shenxiang-new-api/**`, related gateway services only when named
- production_path: `/opt/shenxiang-new-api`
- health: `http://127.0.0.1:3120`, `https://api.aiphui.top`
- evidence_first: New API MySQL `logs`, token/channel/user/order tables, New API app logs, relay gateway logs, media task rows
- forbidden_paths: `/data/ai-essay-editor`, `shenxiang.school` main-site config, Supabase, unrelated containers

### Cloud Codex Service Platform

Use when the user says cloud Codex, 云 Codex, `/codex/`, Codex workspace, file upload recognition, task workspace, skills in the cloud platform, or Codex SSE.

- target_stack: cloud Codex service platform
- local_paths: `services/shenxiang-codex-workspace/**`
- production_path: `/opt/shenxiang-codex-workspace`
- health: `http://127.0.0.1:3140/health`, `https://api.aiphui.top/codex/`
- evidence_first: workspace task directory, `UPLOAD_MANIFEST.md`, Codex workspace logs, `/codex/api/chat/stream`, New API relay logs only when needed
- forbidden_paths: main-site app code, isolated New API data plane, user secrets, generated task artifacts containing internal guidance
- note: cloud Codex is a service platform, not the local development workspace. Do not apply local commit/deploy hygiene rules to user task workspaces.

### Main-Site Codex Skill Gateway

Use when the task mentions the main-site all-in-one agent, `super-all-in-one-agent`, main-site generated files, or `services/codex-skill-gateway`.

- target_stack: main-site Codex skill gateway
- local_paths: `services/codex-skill-gateway/**`, related main-site routes such as `app/api/codex-skill-files/**`
- evidence_first: main-site route chain, generated file preview, browser rendering, gateway logs
- warning: confirm this is not `services/shenxiang-codex-workspace` before editing

### StoryOps

Use when the working directory or user task names `/Volumes/未命名/novel2fdx-storyops`, StoryOps, Sprint 1, raw-source protection, Repository, FDX, or script extraction.

- target_stack: StoryOps local repo
- target_path: `/Volumes/未命名/novel2fdx-storyops`
- evidence_first: actual repo root, `AGENTS.md`, Makefile targets, protected-path checks
- done_card: `make setup`, `make lint`, `make test`, `sf db verify`
- warning: preserve raw-source immutability and do not implement product logic outside the requested sprint

## Evidence Routing

Runtime and business questions must start from evidence, not a repo tour.

- traffic, app usage, token cost, main-site failures: OpenResty logs, `ai_task_runs`, `credit_transactions.billing_metadata`
- New API consumption, model access, user disputes: MySQL `logs`, token rows, channel rows, order rows, request IDs
- cloud Codex upload or task behavior: task workspace files, `UPLOAD_MANIFEST.md`, workspace logs, stream events
- UI rendering defects: target route/component, browser verification, production bundle/cache proof
- third-party model support or current version: live version/model probe, then minimal smoke test

## User-Facing Provider Privacy

User-facing model names, token model lists, UI labels, receipts, logs visible to non-admin users, onboarding copy, and support text must not expose upstream provider or relay names. This includes names such as Geek2API, Moonapix, CCAPI, DragTokens, RelayDance, raw upstream model IDs, upstream account hints, channel IDs, base URLs, API keys, and supplier-specific failure text.

When an upstream-backed model needs to be exposed to users, use a product/public alias instead. For example, the internal New API model `geek2api-image-2` must be shown as `特价 image-2`, not with the supplier name.

## Done Cards

### Main Site Done

1. Relevant local lint/test/build passes, or the skipped command is explained.
2. Commit the fix.
3. Deploy or sync production through the established main-site path.
4. Verify `https://shenxiang.school/api/health`.
5. Verify the real user path or collect equivalent runtime evidence.
6. Confirm production loaded the new code.
7. Confirm local and server worktrees are clean or explain any unrelated dirty files.

### Isolated New API Done

1. Relevant local or container tests pass.
2. Commit the fix.
3. Deploy only the intended New API service or gateway.
4. Verify `shenxiang-new-api` health, `127.0.0.1:3120`, `https://api.aiphui.top`, and main-site health as a non-regression.
5. Verify the real UI/API path and the related logs or billing rows.
6. Confirm local and server worktrees are clean or explain unrelated dirty files.

### Cloud Codex Service Done

1. Run relevant Python tests or `py_compile`/`compileall`.
2. Commit the platform change when it is repository-backed.
3. Deploy `/opt/shenxiang-codex-workspace` only.
4. Verify `127.0.0.1:3140/health` and `https://api.aiphui.top/codex/`.
5. Verify task-workspace behavior without exposing internal guidance in artifacts.
6. If a live task would spend user quota, use an internal no-model smoke and state that boundary.

### Documentation Or Planning Done

1. Put durable rules in the canonical doc, not only in chat.
2. Link or inject the doc where future Codex runs will actually read it.
3. Do not store secrets, private user data, or one-off production values.
4. Verify the file exists and is referenced from the mandatory entry point.

## Local Codex Repair Rule

For local Codex working in this repository, every verified repair must continue through commit, deployment, production verification, and worktree hygiene unless the user explicitly says not to deploy or the task is clearly documentation-only.

Minimum closeout for repair work:

```text
tested:
committed:
deployed:
production_verified:
local_status:
server_status:
remaining_dirty_files:
```

Do not leave a verified hotfix only on a server. If emergency hot sync was used, follow up with a repository commit and server fast-forward or explain why that cannot be done.

## Cloud Codex Platform Rule

Cloud Codex is a hosted service platform for user tasks. Its task workspaces are temporary and user-scoped.

- Inject routing and safety guidance into each task workspace.
- Do not require user task workspaces to commit, deploy, or clean the local project repo.
- Do not expose platform guidance files such as `AGENTS.md`, prompt files, stdout/stderr, or internal config as user artifacts.
- Service-platform code changes still follow the Cloud Codex Service Done card.

## Dangerous Operation Gate

Before deleting files, touching Docker infrastructure, databases, 1Panel, OpenResty, volumes, or production secrets, stop and present:

```text
operation_target:
reason:
potential_impact:
risk_level:
recommended_command:
rollback_plan:
```

Do not proceed without explicit user approval.
