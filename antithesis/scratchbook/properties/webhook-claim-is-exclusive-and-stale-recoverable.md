# webhook-claim-is-exclusive-and-stale-recoverable

## Evidence Trail

- `prepareWebhookDeliveryAttempt` updates a row from `pending` to `processing` only when due, or from stale `processing` when `processingStartedAt` is older than `WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS`.
- The update increments `attemptCount` and returns `Option.none()` when no claim is possible.
- Completion uses attempt count and processing start timestamp as a compare-and-swap guard.

## Failure Scenario

Generate concurrent claim attempts and processing timestamps. At most one non-stale claim can succeed. Stale processing rows become claimable after the timeout and increment attempt count exactly once per successful claim.

## PBT Implementation Notes

Use Hegel to generate claim schedules. In DB-backed tests, fire `prepareWebhookDeliveryAttempt` promises concurrently for the same delivery and assert one `Some` result unless stale recovery applies.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point after claim: a prepared delivery must have state `processing`, non-null `processingStartedAt`, and the returned attempt count must match the row.

## Open Questions

- None
