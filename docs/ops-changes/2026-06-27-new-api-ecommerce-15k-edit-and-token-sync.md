# New API ecommerce 1.5K edit and token sync verification

Date: 2026-06-27

Scope: isolated New API stack at `/opt/shenxiang-new-api`.

## Context

This note records the follow-up verification for `image 2电商商品图快速通道(1.5K)` after switching channel `22` to the draw.dragtokens upstream route.

No full upstream key, session cookie, or user credential is recorded here.

## Channel State

- Channel: `22`
- Display model: `image 2电商商品图快速通道(1.5K)`
- Upstream mapping: `gpt-image-2`
- Base URL: `https://draw.dragtokens.com`
- Masked key observed in logs: `sk-8yRe1Rd...OeLz8y`
- Channel groups: `default,standard,pro,code,internal`
- Channel status: enabled

## Image Edit Verification

The model supports image editing through all three relevant paths:

| Path | Result | Observed latency | Real returned image size |
|---|---|---:|---:|
| Direct upstream `/v1/images/edits` | success | about `23.9s` | `1537x1023` |
| New API `/v1/images/edits` | success | about `28.46s` | `1537x1023` |
| Media playground `/pg/images/edits` | success | about `27.07s` | `1537x1023` |

Latest media-playground edit evidence:

- Submitted log: `7136`, `type=4`, `request_path=/pg/images/edits`, workflow `图像修改`.
- Consumption log: `7138`, `type=2`, `request_path=/pg/images/edits`, channel `22`, token `playground-internal`, `use_time=27`.

## Effective User Token Sync

The user clarified that `id=2` is already cancelled and should be skipped. No token was added for `id=2`.

Read-only MySQL verification, excluding `id=2`:

| Metric | Value |
|---|---:|
| Enabled users excluding `id=2` | `47` |
| Users with `星人图像生成令牌` | `47` |
| Users missing image token | `0` |
| Image tokens containing `image 2电商商品图快速通道(1.5K)` | `47` |
| Image tokens missing the 1.5K model | `0` |

Conclusion: all effective enabled users have the ecommerce 1.5K image model on their image-generation token. The cancelled user `id=2` is intentionally excluded.

## Cloud Codex Sync

Cloud Codex was checked separately:

- `NEW_API_BASE_URL=http://shenxiang-new-api:3000/v1`
- `IMAGE_ALLOWED_MODELS` includes `image 2电商商品图快速通道(1.5K)`
- Runtime settings also expose this model in `image_allowed_models`

## Remaining Risk

The upstream still reports flexible metadata such as `size=auto`, so production capacity should continue to be judged by decoded output pixels and New API logs, not by response metadata alone.
