# internal-worker-codecs-reject-malformed-envelopes

## Evidence Trail

- `packages/core/src/internal-message-codec.ts` decodes direct sync jobs, Pub/Sub sync push envelopes, dead-letter envelopes, Gmail push notifications, control jobs, and webhook delivery requests.
- It uses Effect Schema for typed payloads and custom base64 JSON decoding for Pub/Sub push messages.
- Gmail `historyId` accepts number or string and normalizes to string.

## Failure Scenario

Generate arbitrary JSON-like payloads, invalid base64, missing `message.data`, empty IDs, unsupported control job kinds, and valid envelopes. Decoders must either return exact error strings or normalized valid values.

## PBT Implementation Notes

Use Hegel recursive JSON generators bounded by size. Include generator combinators for valid payloads so the property checks both rejection and acceptance paths.

## SUT-Side Instrumentation

Missing. Future `AlwaysOrUnreachable` assertion point in worker route interpreter: decoded requests reaching processors have non-empty IDs and supported kinds.

## Open Questions

- None
