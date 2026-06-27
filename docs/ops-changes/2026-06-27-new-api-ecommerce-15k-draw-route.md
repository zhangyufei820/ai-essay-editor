# New API ecommerce 1.5K draw route

Date: 2026-06-27

Scope: isolated New API stack at `/opt/shenxiang-new-api`.

## Change

- Switched channel `22` (`image 2电商商品图快速通道(1.5K)`) to `https://draw.dragtokens.com`.
- Replaced the channel key with the supplied draw.dragtokens key.
- The key is intentionally not recorded in this repository. Verification used only the masked form `sk-8yRe1Rd...OeLz8y`.
- A channel-only SQL backup was written on the server before the update:
  `/data/ai-essay-editor-quarantine/20260627-new-api-channel22-draw/channel22-before.sql`

## Capability Probe

Direct upstream endpoint:

- `https://draw.dragtokens.com/v1/images/generations`
- `http://draw.dragtokens.com` redirects to HTTPS with `308`.
- `/v1/models` is not supported by this host and returns: `draw.dragtokens.com only accepts image API paths`.

Real returned image sizes from direct probes:

| Requested size | Returned pixels | Response time |
|---|---:|---:|
| `1024x1024` | `1254x1254` | `58.59s` |
| `1536x1024` | `1536x1024` | `21.21s` |
| `2048x2048` | `1254x1254` | `59.95s` |
| `4096x4096` | `1254x1254` | `38.28s` |

Conclusion: the route supports the advertised 1.5K ecommerce horizontal output, but does not deliver true 2K or 4K in these probes.

## Production Verification

- `/v1/images/generations` through New API succeeded for `image 2电商商品图快速通道(1.5K)`.
- `/pg/images/generations` through the media-playground path succeeded with a session-authenticated request.
- New API logs confirmed channel `22`, base `https://draw.dragtokens.com`, and key mask `sk-8yRe1Rd...OeLz8y`.
- The media-playground request produced both:
  - submitted log: `type=4`, `request_path=/pg/images/generations`
  - consume log: `type=2`, `request_path=/pg/images/generations`

## Cloud Codex Sync

- Cloud Codex runtime uses `NEW_API_BASE_URL=http://shenxiang-new-api:3000/v1`.
- Its image allowed models already include `image 2电商商品图快速通道(1.5K)`.
- Existing `星人图像生成令牌` rows were checked: all 48 non-deleted image tokens include the 1.5K ecommerce model.

## Remaining Risk

The draw route normalizes response metadata to `size=auto` and `quality=auto`, so capacity should be judged by actual decoded pixels, not response metadata alone.
