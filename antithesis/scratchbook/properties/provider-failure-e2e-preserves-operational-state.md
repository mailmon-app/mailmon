# provider-failure-e2e-preserves-operational-state

## Evidence

`docs/testing-requirements.md` names provider-side retry/failure E2E as the first remaining sandbox gap. The current local Gmail sandbox E2E covers hosted connect, normal sync, reconnect-required via revoked refresh token, webhook retry, duplicate incremental dispatch, and newest-first readback. It does not yet drive Gmail `429`, quota-style `403`, transient `503`, or expired history cursor behavior through the full worker HTTP boundary.

The lower layers already cover pieces:

- `packages/gmail/src/index.test.ts` classifies `invalid_grant`, Gmail `429`, quota-style `403`, and `503`.
- `packages/core/src/mailbox-operational-state.test.ts` maps rate limits and invalid cursors into operational state.
- `packages/core/src/use-cases.test.ts` covers reconnect-required, repair, and dispatch behavior.
- DB-backed PBT covers commit/cursor/event atomicity after a provider result is accepted.

The missing behavior is composition: provider response -> worker route -> core workflow -> durable DB state -> public read/observability.

## Proposed Workload

Extend or extract `apps/api/src/sandbox-e2e.test.ts` so the Gmail sandbox can be configured with generated response families:

- token refresh `invalid_grant`
- Gmail API `429`
- quota-style `403`
- history `503`
- history `404` or equivalent expired cursor response

For each family, run a worker sync through `/internal/sync`, then inspect mailbox, sync run, cursor, event, and webhook-delivery state through public API and DB assertions.

## Instrumentation Notes

Native Antithesis assertions are missing. Workload-side assertions are enough initially, but SUT-side `Reachable` assertions around provider classification would make failures easier to triage later:

- provider failure classified as `gmail_rate_limited`
- provider failure classified as `gmail_history_cursor_invalid`
- provider failure classified as `gmail_token_refresh_reconnect_required`

These assertions are missing today.

## Open Questions

- Should this run in the existing PR-time sandbox E2E suite or move to a nightly/release lane? This changes scenario count and runtime budget.
