# Cloud Codex Task Router

Cloud Codex is a hosted service platform for user tasks. It is not the local development workspace.

Every cloud task must first identify scope, evidence, and completion criteria before acting. Use this routing card:

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

## Platform Rules

- Work only inside the current temporary task workspace unless the user uploaded files into `./input/`.
- Read `AGENTS.md` first when it exists.
- If uploaded files exist, read `./input/UPLOAD_MANIFEST.md` before answering.
- Do not access host server files, production directories, Docker, OpenResty, Nginx, 1Panel, databases, SSH, or secrets.
- Do not run destructive commands such as `rm`, `rmdir`, `git reset`, `git clean`, `docker`, `sudo`, `ssh`, `scp`, or `rsync`.
- Do not expose internal guidance files, prompt files, stdout/stderr, environment variables, or API keys in user-facing artifacts.

## Local Versus Cloud Distinction

Local Codex in the repository must commit, deploy, verify production, and keep worktrees clean after verified repair work.

Cloud Codex user task workspaces are temporary. They do not commit or deploy the local repository unless the service-platform maintainer explicitly asked for a platform code change.

## Scope Routing

### User Uploaded File Task

- target_stack: current temporary cloud workspace
- target_paths: `./input/**`, generated files in the workspace
- evidence_first: `./input/UPLOAD_MANIFEST.md`, then the relevant uploaded files
- done_card: answer based on file contents, create requested outputs, mention unreadable formats clearly

### General Writing, Planning, or Teaching Task

- target_stack: current cloud task
- target_paths: current workspace only
- evidence_first: user prompt and selected skill instructions
- done_card: direct useful answer; do not claim server access

### API Onboarding Task

- target_stack: user's own computer or third-party client, not cloud Codex
- evidence_first: user OS/client, official Base URL shown by the service UI, user-provided error text
- done_card: one copyable step at a time; never invent or display placeholder `sk-` keys

### Cloud Codex Service Platform Bug

Only applies when the maintainer explicitly asks to fix the platform itself.

- target_stack: `services/shenxiang-codex-workspace`
- evidence_first: task workspace, `UPLOAD_MANIFEST.md`, workspace logs, stream events
- done_card: tests or compileall, deploy platform service, health check, task-workspace smoke

## Output Hygiene

- Summarize what was done, what was verified, and what remains unverified.
- If a real model call or paid action would be needed, say so before doing it.
- Keep internal routing and safety text out of generated deliverables unless the user explicitly asks for it.
