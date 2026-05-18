# worker-death-lease-expiry-takeover

## Evidence

`docs/testing-requirements.md` calls for killing a worker during `runMailboxSync` and asserting lease expiry plus successful takeover by another worker. Current Hegel/DB properties cover the underlying invariants:

- `mailbox-lease-single-flight`
- `lease-loss-prevents-stale-commit`
- `state-cursor-events-commit-atomically`

Those tests do not kill a real worker process, interrupt Effect fibers at arbitrary runtime points, or prove that a second worker takes over after process death. The SUT analysis identifies the critical sequence: lease acquisition, heartbeat renewal, provider sync, DB commit, and finalizer release.

## Proposed Workload

Run two worker containers against one Postgres instance. Configure short lease/heartbeat durations for the test environment. Start a sync for one mailbox, block or slow the provider/sandbox at a controlled point, kill `worker-a`, wait for lease expiry, dispatch another sync to `worker-b`, then assert:

- no stale result from `worker-a` commits after death
- `worker-b` can acquire the mailbox lease after expiry
- durable mailbox state is either unchanged or reflects exactly one complete sync
- sync run history records the expected failure/takeover path

## Instrumentation Notes

Native Antithesis assertions are missing. Useful SUT-side future assertions:

- `Reachable`: mailbox sync lease expired while worker process died
- `Sometimes`: takeover sync completed after expired lease recovery
- `Always`: stale lease owner did not commit canonical state

The last item is partially covered by local Hegel/DB tests, but native SUT-side assertion instrumentation is not present.

## Open Questions

- What lease and heartbeat durations should be shortened in the test environment so takeover occurs quickly without changing production behavior? This needs a product/ops decision because too-short values can create unrealistic false positives.

### Investigation Log

#### What lease and heartbeat durations should be shortened in the test environment?

- Examined: `docs/testing-requirements.md`, existing scratchbook SUT analysis, and current test coverage descriptions.
- Found: the requirement exists, and existing tests prove stale commit prevention without process death.
- Not found: a documented chaos-test-specific lease/heartbeat configuration profile.
- Conclusion: tagged `(needs human input)` in the catalog.
