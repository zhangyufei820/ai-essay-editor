# New API ops token safety rule

Date: 2026-06-27

Scope: isolated New API stack and related media playground / Cloud Codex operational testing.

## Background

During New API operational verification, a temporary command selected a token by global token name and latest access time. That pattern can accidentally select a real user's token when multiple users have the same token name.

This note makes the safer rule explicit for future smoke tests, direct upstream tests, media-playground compatible tests, log checks, and billing verification.

## Mandatory rule

- All operational test commands must use `user_id=1` or a dedicated ops token.
- SQL, shell scripts, curl wrappers, and ad-hoc diagnostics must explicitly scope token lookup by `user_id=1`, ops user id, ops token id, or another unique ops-only identifier.
- Token values must be masked in terminal output, logs, screenshots, docs, and commits.
- After a test, log verification must be anchored by ops user/token identifiers, request id, channel id, and a bounded timestamp window.

## Prohibited lookup pattern

Do not globally fetch the latest token by display name:

```sql
SELECT ...
FROM tokens
WHERE name = '<token_name>'
ORDER BY accessed_time DESC, id DESC
LIMIT 1;
```

This is unsafe because token display names are not globally unique and recent access time may point to a real user.

## Safe lookup pattern

Use an ops-scoped lookup:

```sql
SELECT ...
FROM tokens
WHERE user_id = 1
  AND name = '<ops_token_name>'
  AND deleted_at IS NULL
ORDER BY id DESC
LIMIT 1;
```

If a non-admin ops token is introduced later, document its owner, purpose, allowed model scope, and rotation policy without storing the full key in git.

## Verification checklist

- [ ] Command uses `user_id=1` or a dedicated ops token.
- [ ] Command output masks token values.
- [ ] Logs are queried by ops user/token/request/channel/time window, not by global token name.
- [ ] Billing checks separate ops-generated calls from real user calls.
- [ ] No full API keys or user secrets are pasted into docs or commits.
