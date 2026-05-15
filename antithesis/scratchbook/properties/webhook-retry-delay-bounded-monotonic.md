# webhook-retry-delay-bounded-monotonic

## Evidence Trail

- `calculateWebhookDeliveryRetryDelayMs` uses `5000 * 2 ** (attemptCount - 1)` capped at 15 minutes.
- `classifyWebhookDeliveryResponse` retries 5xx until max attempts and treats 4xx as terminal.
- `classifyWebhookDeliveryFailure` retries only retryable failures until max attempts.

## Failure Scenario

Generate attempt counts and failure kinds. Retryable failures before max attempts must produce `pending` completions with bounded exponential `nextAttemptAt`; max-attempt failures must become terminal.

## PBT Implementation Notes

Use pure Hegel properties over classification functions with generated timestamps, status codes, and failure records. Assert monotonic delay by comparing adjacent generated attempt counts.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point: any retryable pending completion has `nextAttemptAt > completedAt` and delay <= 900000 ms.

## Open Questions

- None
