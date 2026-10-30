# GPT-5.5 / GPT-5.6 retirement

Effective 2026-10-30, the exact public IDs `gpt-5.5` and `gpt-5.6` are retired across isolated New API.

- Reject requests before token or channel selection, including unrestricted tokens and forced channels. Exclude both IDs from public model/pricing responses and stale frontend model lists.
- The manifest-pinned permission sync and entry guard must not grant them. The provider monitor must not revive their routes. Reconciliation removes their channel model entries, disables abilities, retires catalog rows, removes active pricing keys, and cleans existing token limits and token caches.
- Keep independent variants `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.5-openai-compact`. This retirement does not apply to the entire 5.x family.
- Default onboarding and reverse-image prompting use `gpt-6.1-sol`.
- `codex-auto-review` keeps its existing public ID and retail prices. Its upstream mapping moves to `gpt-5.6-sol`, already configured on the same routes. Legacy GPT-5.5 price definitions remain as historical/reference data; catalog and price reconciliation explicitly skip retired IDs.
- Preserve historical usage/billing records, balances, subscriptions, and the main site.

Before applying the metadata retirement, save model status, ability status, channel model/mapping fields, affected token limit fields (never token keys), and the five model price options in a root-readable snapshot outside Git. Acquire the existing model-sync lock for application. Deploy application code only through the guarded release; load the retirement implementation from the released immutable checkout. Verify retirement again after reconciliation to prove it is persistent.

Rollback is a reviewed forward release restoring the prior policy, followed by restoring only the metadata fields in the snapshot. Never restore entire user rows, balances, token keys, or historical consumption logs. An image rollback alone does not undo metadata retirement.

Verification: targeted Python permission/monitor/entry/smoke tests, Go distribution and catalog tests, admin-token public model listing, 404 responses for both retired IDs, positive Responses and vision probes for the replacement model, and a completed auto-review response. Verify main-site health without changing its deployment.
