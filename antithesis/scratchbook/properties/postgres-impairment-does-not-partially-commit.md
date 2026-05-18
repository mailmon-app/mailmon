# postgres-impairment-does-not-partially-commit

## Evidence

`docs/testing-requirements.md` lists PostgreSQL latency and dropped connections via a proxy such as Toxiproxy as required chaos work. Existing DB-backed PBT validates transaction boundaries under generated inputs, but it uses a normal Postgres connection. It does not cut connections, delay commits, or exhaust pools while sync/webhook work is in progress.

The highest-value paths are:

- mailbox sync commit: canonical messages/threads, events, sync run, and cursor
- mailbox sync lease acquire/renew/release
- webhook delivery claim/finalize/retry
- replay claim and delivery scheduling

## Proposed Workload

Route SUT DB traffic through Toxiproxy. Generate operations that start sync commits and webhook delivery finalization while toggling latency, connection resets, and temporary unavailability. After each fault window, inspect durable state for all-or-nothing outcomes.

The key check is not "all requests succeed." The property is that failures are explicit and state is never partially committed.

## Instrumentation Notes

Native Antithesis assertions are missing. Workload-side DB reads can check most invariants. SUT-side `Reachable` assertions would help verify that injected impairment hits the intended internal branches:

- sync commit DB error path
- webhook claim DB error path
- webhook finalize DB error path
- lease heartbeat DB error path

## Open Questions

- Which DB impairment mechanism should be canonical for local runs: Toxiproxy, Postgres restart, or direct driver-level fault injection? Toxiproxy matches the documented requirement, but driver-level injection may shrink and reproduce more cleanly in Vitest.
