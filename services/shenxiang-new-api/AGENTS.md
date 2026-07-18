# New API Codex Notes

Scope: isolated New API stack under `/opt/shenxiang-new-api`.

Before touching production New API operations, read:

1. `docs/BILLING-CURRENCY-RMB.md` before any pricing, billing, quota, refund, subscription, or balance work.
2. `docs/IMAGE-RETENTION-ROTATION.md`
3. Root project `docs/CODEX-SKILL-SOP.md`
4. Root project `docs/SERVER-CLEANUP-SOP.md`
5. `docs/CLASSIC-THEME-ONLY.md` for all New API UI work.
6. `docs/SYSTEM-TEST-TOKENS.md` before running or editing any smoke, probe, monitor, or system-test path.

Hard boundaries:

- All user-visible prices, actual charges, balance deductions, refunds, subscription prices, and subscription allowances are denominated in CNY. USD-compatible backend fields are calculation intermediates only and must follow `docs/BILLING-CURRENCY-RMB.md`.
- Keep New API isolated from the main `shenxiang.school` Next.js app, Supabase, `/data/ai-essay-editor`, 1Panel, and OpenResty unless the user explicitly reopens scope.
- New API production UI only maintains the `classic` theme. Do not edit or sync `web/default/**` for UI parity unless the user explicitly asks for `default`.
- Never run `docker system prune`, `docker volume prune`, `docker network rm`, or broad container deletion for New API disk cleanup.
- Never delete MySQL, Redis, media cache, upload data, Docker volumes, networks, 1Panel files, OpenResty/Nginx config, or secrets.
- For image cleanup, rotate only `shenxiang-new-api-codex:*` images that are not referenced by any container and are outside the retention rules.
- System tests, smoke checks, probes, and monitors that need a New API token must use admin `user_id=1` tokens only. Never use a normal user's API key.

When disk pressure is caused by repeated New API deploys, Codex should own the cleanup execution. The user is not expected to manually run the rotation.
