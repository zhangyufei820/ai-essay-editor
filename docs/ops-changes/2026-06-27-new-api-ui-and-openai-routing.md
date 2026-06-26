# New API UI and OpenAI Routing Drift Closure

Date: 2026-06-27
Scope: isolated New API stack at `/opt/shenxiang-new-api`

## Summary

This change closes the gap between production-hot-deployed New API UI work and the repository state, and records the OpenAI text routing update that makes Dragtokens the primary provider.

## Production State Confirmed

- The running production image was `shenxiang-new-api-codex:2800fb8d-20260626-234055-ui2`.
- The local UI source hashes matched the production build source under `/opt/shenxiang-new-api/build/src-codex-2800fb8d-20260626-2129`.
- The UI changes had been deployed before they were committed locally, so they were committed afterward to remove source drift.

## UI Changes

- Added the Cloud Codex entry to the New API top navigation as `云 Codex`.
- Updated the right-side onboarding assistant to use the uploaded avatar asset.
- Added launcher guidance animation and a reduced-motion fallback.
- Embedded and served the assistant avatar from `/assets/xingren-api-assistant-avatar.jpg`.
- Updated the codex entry guard script so future source patching normalizes `云 Codex` labels and targets the latest build source root.

## OpenAI Routing Changes

- Dragtokens channel `#21` is the primary provider for OpenAI text models:
  - `gpt-5.5`
  - `gpt-5.4`
  - `gpt-5.4-mini`
- The fallback order is fixed as:

```text
#21 dragtokens.com -> #2 moonapix.com -> #14 yunwu.ai -> #3 www.vivaapi.cn -> #1 tokenflux.dev
```

- `provider_monitor.py` now keeps the OpenAI text family in fixed order instead of dynamically swapping fallback priority by latency score.
- `setup_dragtokens_monthly_card.py` defaults Dragtokens text setup to the three OpenAI text models above.

## Verification

- `gpt-5.4-mini` request through the API onboarding assistant token returned HTTP 200 and logged `channel_id=21`.
- `gpt-5.4` request through a Codex text token returned HTTP 200 and logged `channel_id=21`.
- `gpt-5.5` request through a Codex text token returned HTTP 200 and logged `channel_id=21`.
- `provider_monitor.sh --dry-run` reported OpenAI ranked channel order `[21, 2, 14, 3, 1]`.
- Production `shenxiang-new-api`, MySQL, and Redis were healthy after restart.

## Operational Note

When New API changes are hot-synced, image-built, or patched directly into `/opt/shenxiang-new-api`, commit the corresponding local source changes immediately after verification. Do not leave production-only UI or routing changes outside git, because later rebuilds can silently overwrite them.
