# deployed-pubsub-retries-redispatch-sync

## Evidence

`docs/testing-requirements.md` says deployed environments still need validation that Pub/Sub retries eventually redispatch failed mailbox sync push requests. `docs/staging-validation-guide.md` documents the manual Gmail push/watch path and Cloud Tasks path. Worker route tests cover local decoding, OIDC rejection/verification behavior, retryable failure HTTP status preservation, and dead-letter envelope handling.

The gap is real transport behavior in `gcp` mode:

- Pub/Sub push invocation with Google OIDC
- worker returns non-`2xx` for retryable sync failure
- Pub/Sub retries according to configured policy
- dead-letter delivery invokes `/internal/sync-dead-letter`
- durable exhaustion is recorded as `mailbox_sync_dispatch_retry_exhausted`

## Proposed Workload

Start from staging validation and automate a synthetic mailbox sync dispatch that intentionally fails the worker route for a bounded window, then succeeds or reaches dead-letter. The workload should avoid real customer data and should use synthetic workspace/mailbox IDs.

If local emulation is attempted first, it must still preserve the important contract: the worker must see a Pub/Sub-shaped OIDC-authenticated push and dead-letter envelope.

## Instrumentation Notes

Native Antithesis assertions are missing. Useful future assertions:

- `Sometimes`: Pub/Sub retry observed for sync dispatch
- `Sometimes`: sync dead-letter handler records retry exhaustion
- `Always`: malformed or unauthenticated internal pushes do not execute sync work

Worker route tests cover the last invariant locally but do not provide native Antithesis instrumentation.

## Open Questions

- Can this be automated safely in staging without using real customer data or exhausting Gmail/Pub/Sub quotas? This depends on staging project limits and cleanup ownership.

### Investigation Log

#### Can this be automated safely in staging without exhausting quotas?

- Examined: `docs/staging-validation-guide.md` and `docs/testing-requirements.md`.
- Found: staging validation is manual and assumes GCP project access, a test Gmail account, and a public webhook receiver.
- Not found: quota budgets, test account lifecycle, cleanup ownership, or an automated staging fixture policy.
- Conclusion: tagged `(needs human input)` in the catalog.
