# System Test Tokens

System tests, smoke checks, probes, monitors, and route verification scripts must use admin-owned New API tokens only.

Required owner:

```text
user_id=1
```

Hard rules:

- Do not use, paste, copy, or pass a normal user's API key into a system test.
- Do not select a token only by name. Always constrain token lookup by `user_id=1`.
- Do not print raw API keys in logs, stdout, docs, commits, or final reports.
- Scripts that need a New API token must resolve it from MySQL by `user_id=1` and known system token name, then print only token metadata such as `token_id`, `user_id`, and profile.
- Scripts must fail closed when a token is missing, disabled, or not owned by `user_id=1`.
- Production probes that make real `/v1/*` requests can spend quota; use the admin token and keep request payloads minimal.

Known admin system token names:

```text
星人 Codex 文本令牌
星人 Claude 高阶令牌
星人图像生成令牌
星人视频生成令牌
星人 Grok 4.5 测试令牌
```

Implementation guardrails:

- `service.EnsureSystemTokensForUserID` creates the four public Codex, Claude, image, and video system tokens for every enabled user. Only `user_id=1` receives the additional Grok 4.5 system-test token.
- `service.StartSystemTokenReconcileTask` reconciles `user_id=1` separately for audit visibility, then backfills the four public system tokens for every enabled non-admin user.
- Go reconciliation owns token existence, safe bootstrap limits, group selection, and retry policy. It must not overwrite an enabled token's exact non-Grok model list.
- `scripts/sync_app_model_permissions.py` is the single writer for the exact Codex, Claude, image, and video model lists on all managed system tokens. This prevents the two reconcilers from oscillating between different catalogs.
- `scripts/smoke_test.sh` refuses raw API key arguments and resolves admin tokens from MySQL.
