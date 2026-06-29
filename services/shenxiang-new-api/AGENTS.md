# New API Codex Notes

Scope: isolated New API stack under `/opt/shenxiang-new-api`.

Before touching production New API operations, read:

1. `docs/IMAGE-RETENTION-ROTATION.md`
2. Root project `docs/CODEX-SKILL-SOP.md`
3. Root project `docs/SERVER-CLEANUP-SOP.md`
4. `docs/CLASSIC-THEME-ONLY.md` for all New API UI work.

Hard boundaries:

- Keep New API isolated from the main `shenxiang.school` Next.js app, Supabase, `/data/ai-essay-editor`, 1Panel, and OpenResty unless the user explicitly reopens scope.
- New API production UI only maintains the `classic` theme. Do not edit or sync `web/default/**` for UI parity unless the user explicitly asks for `default`.
- Never run `docker system prune`, `docker volume prune`, `docker network rm`, or broad container deletion for New API disk cleanup.
- Never delete MySQL, Redis, media cache, upload data, Docker volumes, networks, 1Panel files, OpenResty/Nginx config, or secrets.
- For image cleanup, rotate only `shenxiang-new-api-codex:*` images that are not referenced by any container and are outside the retention rules.

When disk pressure is caused by repeated New API deploys, Codex should own the cleanup execution. The user is not expected to manually run the rotation.
