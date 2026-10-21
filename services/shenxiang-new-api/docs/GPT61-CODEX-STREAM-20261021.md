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
- Keep the existing 45-second initial Responses deadline until effective output or a terminal completion is seen, rather than cancelling it for metadata or placeholder spaces.
- Preserve existing behavior for genuine partial output, tool-only output, missing usage after real output, and client-disconnection usage draining. Never replay a stream after effective output has been sent.

This does not change model permissions, public model names, prices, subscriptions, or main-site code. Historical charges are not modified by this patch.

## Verification

The new fixtures fail before the patch and pass after it. Targeted Go verification covers the Responses handler, scanner deadline, retry guards, explicit SSE errors, and output tracking. The release contracts additionally require the whitespace rejection, event-order preservation, buffer bound, and useful-output deadline tests.

Production verification must use only the admin-owned system token, through the public `/v1/responses` endpoint, and check both a completed text answer and a completed function-call/output round trip. This simulates the Codex protocol, not the affected user's desktop UI. Supplier redundancy remains limited to the suppliers that pass the existing strict health gate.
