# internal-worker-codecs-reject-malformed-envelopes

## Evidence Trail

- `packages/core/src/internal-message-codec.ts` decodes direct sync jobs, Pub/Sub sync push envelopes, dead-letter envelopes, Gmail push notifications, control jobs, and webhook delivery requests.
- It uses Effect Schema for typed payloads and custom base64 JSON decoding for Pub/Sub push messages.
- Gmail `historyId` accepts number or string and normalizes to string.

## Failure Scenario

Generate arbitrary JSON-like payloads, invalid base64, missing `message.data`, empty IDs, unsupported control job kinds, and valid envelopes. Decoders must either return exact error strings or normalized valid values.

## PBT Implementation Notes

Implemented in `packages/core/src/internal-message-codec.pbt.test.ts` with recursive JSON generators bounded by size plus generated valid payloads for direct, Pub/Sub, dead-letter, webhook, control, and Gmail push paths.

Next improvement: add `tc.note` for malformed kind and generated payload shape so shrunk decoder failures are easier to triage.

## SUT-Side Instrumentation

Native Antithesis SDK instrumentation is missing. Local Hegel workload exists. Future `AlwaysOrUnreachable` assertion point in worker route interpreter: decoded requests reaching processors have non-empty IDs and supported kinds.

## Open Questions

- None
