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
```

Implementation guardrails:

- `service.EnsureSystemTokensForUserID` is restricted to `user_id=1`.
- `service.StartSystemTokenReconcileTask` reconciles only `user_id=1`.
- `scripts/sync_app_model_permissions.py` updates managed system-token model limits only where `user_id=1`.
- `scripts/smoke_test.sh` refuses raw API key arguments and resolves admin tokens from MySQL.
