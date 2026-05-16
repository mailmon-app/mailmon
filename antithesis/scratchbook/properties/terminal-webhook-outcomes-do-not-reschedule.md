# terminal-webhook-outcomes-do-not-reschedule

## Evidence Trail

- `finalizeWebhookDelivery` calls `scheduleWebhookDeliveryRequests` only when the completion state is `pending`.
- `classifyWebhookDeliveryResponse` returns `delivered` for 2xx, terminal failed for 4xx, and retry-exhausted for maxed 5xx.
- `classifyWebhookDeliveryFailure` returns terminal failed for nonretryable or exhausted retryable failures.

## Failure Scenario

Generate terminal HTTP responses and sender failures. No terminal classification may include a next attempt or schedule follow-up work.

## PBT Implementation Notes

Partially implemented in `packages/core/src/webhook-delivery-execution.pbt.test.ts`. Current Hegel coverage verifies terminal classifications have `nextAttemptAt: null` and never return `scheduled_for_retry`.

Remaining improvement: add a small service-layer test with a fake scheduler that records calls. The fake scheduler must see zero calls for terminal completions.

## SUT-Side Instrumentation

Native Antithesis SDK instrumentation is missing. Local Hegel workload is partially present. Future `Always` assertion point: if result status is `delivered`, `failed`, or `retry_exhausted`, then `nextAttemptAt` is null.

## Open Questions

- None
