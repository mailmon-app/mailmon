# webhook-retry-delay-bounded-monotonic

## Evidence Trail

- `calculateWebhookDeliveryRetryDelayMs` uses `5000 * 2 ** (attemptCount - 1)` capped at 15 minutes.
- `classifyWebhookDeliveryResponse` retries 5xx until max attempts and treats 4xx as terminal.
- `classifyWebhookDeliveryFailure` retries only retryable failures until max attempts.

## Failure Scenario

Generate attempt counts and failure kinds. Retryable failures before max attempts must produce `pending` completions with bounded exponential `nextAttemptAt`; max-attempt failures must become terminal.

## PBT Implementation Notes

Implemented in `packages/core/src/webhook-delivery-execution.pbt.test.ts` with pure Hegel properties over classification functions, generated status/failure families, and adjacent attempt-count comparisons.

Next improvement: add `tc.note` for attempt count, status code, and failure code so shrunk failures report the generated boundary case directly.

## SUT-Side Instrumentation

Native Antithesis SDK instrumentation is missing. Local Hegel workload exists. Future `Always` assertion point: any retryable pending completion has `nextAttemptAt > completedAt` and delay <= 900000 ms.

## Open Questions

- None
