# GPT-6.1 Sol

Public model ID: `gpt-6.1-sol`.

Prices are fixed CNY Model Plaza prices per million tokens, including when the
request routes through `plus`, `discount`, or `special`. Do not apply the routing
group multiplier a second time.

| Input length | Input CNY/M | Output CNY/M |
| --- | ---: | ---: |
| Up to and including 272,000 tokens | 2 | 10 |
| More than 272,000 tokens | 4 | 15 |

The longer tier applies to the whole request, not only the excess input tokens.
No separate cache discount was supplied: cache read/create use the corresponding
input rate (2 or 4 CNY/M). Backend expression coefficients divide these prices by
`USDExchangeRate` exactly once; balances and deductions remain CNY.

The model uses independent per-group chains with existing OpenAI source
credentials. Only origins passing Responses, Chat Completions, repeated short
text probes and Codex tool round trips are enabled. Failed origins remain
disabled. Existing GPT-6 Sol and Astra chains are separate.

After the governed release, load the New API environment without printing it and
run the manifest-pinned `configure_gpt6_astra_channel.py` with
`GPT6_MODEL_PROFILE=sol61 --reconcile`. The regular permissions runner retains
this profile and reconciles the account/token model lists. Current restricted
text keys receive the model only when their group chain has a routable ability;
unrestricted keys inherit visibility. Future managed text and monthly-card keys
include the model through their normal account paths.

Validation:

- Python catalog, isolated ability sync, token preservation/idempotence, profile,
  periodic-writer and runner tests.
- `TestGpt61SolMarketplacePricingBoundary`: actual billing engine at 271999,
  272000 and 272001 input tokens, across default/plus/discount/special.
- Admin-owned production token: models list, minimal request, actual log quota
  recalculated into CNY, and Model Plaza metadata.
