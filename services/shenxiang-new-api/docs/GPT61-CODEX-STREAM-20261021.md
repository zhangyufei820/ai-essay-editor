# GPT-6.1 Sol Codex stream investigation (2026-10-21)

## Evidence

- The reported client was Codex with a connection failure indicator.
- All 123 enabled accounts had an active model-authorized token and an enabled route; the affected account's managed Codex token included `gpt-6.1-sol` and the intended routing groups.
- The four reported Responses requests ended at EOF after 1–2 seconds, each recorded as one output token without a completed-event marker in the consumption metadata.
- Synthetic provider probes showed intermittent whitespace-only output without a terminal event within the probe window. Other high/xhigh text and high-reasoning function/tool round trips succeeded. The provider issue is intermittent; a short text probe alone is insufficient evidence of Codex health.
- The handler accepted whitespace as effective output, estimated a token from it, and could report success after EOF. A regression fixture reproduces this with both missing and whitespace-only terminal events.

The production logs do not retain raw user requests or SSE bodies. The exact bytes of the historical requests cannot be reconstructed from those logs.

## Change

- Buffer the initial Responses metadata and whitespace until effective text, reasoning, tool, audio, or image output appears. Preserve the original event data and order when flushing.
- Bound the prelude to 256 KiB and 128 events per attempt.
- Return the existing retryable empty-response error for a prelude-only EOF/timeout, before fallback token estimation. Failed attempts do not enter successful usage billing.
- Preserve the existing scanner timeout semantics, including long reasoning after initial metadata; successful high-reasoning probes can take longer than 45 seconds.
- Preserve existing behavior for genuine partial output, tool-only output, missing usage after real output, and client-disconnection usage draining. Never replay a stream after effective output has been sent.

This does not change model permissions, public model names, prices, subscriptions, or main-site code. Historical charges are not modified by this patch.

## Verification

The new fixtures fail before the patch and pass after it. Targeted Go verification covers the Responses handler, scanner deadline, retry guards, explicit SSE errors, and output tracking. The release contracts additionally require the whitespace rejection, event-order preservation, buffer bound, and delayed-output preservation tests.

Production verification must use only the admin-owned system token, through the public `/v1/responses` endpoint, and check both a completed text answer and a completed function-call/output round trip. This simulates the Codex protocol, not the affected user's desktop UI. Supplier redundancy remains limited to the suppliers that pass the existing strict health gate.

## Long-context edge timeout protection (2026-11-16)

GPT-6 Astra requests on the affected default route showed first effective response latency growing from about 28 seconds to 101 seconds as conversation input grew from about 38k to 101k tokens. Later requests repeatedly disconnected after roughly 117 seconds with no received data. The user confirmed the same account, model and original conversation. Small admin requests on that exact route completed in 3–5 seconds, so they do not reproduce long-context prefill.

Streaming POST `/v1/responses` now sends SSE comment keepalives every 10 seconds, both while awaiting upstream response headers and while reading the upstream stream. This narrowly scoped behavior does not depend on the site's general ping setting, and still respects an adaptor's explicit `DisablePing`. Non-streaming requests and other endpoints retain their existing behavior.

Comments contain no model content and must not mark effective output, stop safe fallback, or create token usage. The pre-header writer is cancelled and joined before the upstream result is handled, with bounded writes, so it cannot race output/error handling or outlive Gin's context. If an attempt fails after only comments, the existing Responses SSE error and output-aware retry paths remain in effect. Existing long-reasoning and empty-output handling remains unchanged.

Regression fixtures use delayed upstream headers and a silent response body with general ping disabled. Both must deliver a comment to the client before upstream content and stop cleanly on cancellation. Production verification must use an admin token and distinguish header/comment latency from actual model output latency; never replay a normal user's private conversation for a system test.

### Default Astra long-conversation latency routing

The next two affected requests completed with 156,919 and 158,178 input tokens, `low` reasoning and about 99.6% cache hits. Both first waited about 118–124 seconds for the default PDHLZY attempt to fail with empty output, then completed through ZWACA in a further 89–92 seconds. The logged first-response metric includes the failed attempt and must not be attributed to the final supplier's own effective-text latency.

Default Astra now prefers the verified ZWACA source (`xingren-discount-text-aihub`, a historical tag) over PDHLZY. The existing default channel identities and credentials stay with their suppliers; only channel and ability priorities change. Other routing groups, Sol profiles, model identity, reasoning settings and pricing remain unchanged. Eligibility still requires fresh provider verification; a failed supplier is not enabled merely because it has a preferred priority. The periodic manifest-pinned reconcile owns the same priority policy, preventing the old ordering from returning on the next sync.

Operational application must take a private rollback snapshot, target `groups=("default",)` only, and wait for the normal channel-cache refresh before testing. Verify actual user-path latency separately from tiny admin probes; removing the failed primary's waiting time does not make a large conversation a tiny request.
