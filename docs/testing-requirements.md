# Mailmon Testing Requirements & Strategy

This document outlines the testing requirements to bring the `mailmon-dev` event-driven synchronization engine to full production readiness.

It is based on the system's architecture, which heavily utilizes the **Effect** framework for dependency injection and concurrency control, **PostgreSQL (Drizzle)** for state management and leases, and **Google Cloud Tasks** for background queueing.

## 1. Current State Assessment

The current test harness provides an excellent foundation:

- **Unit & Business Logic:** Extensive use of Effect `Layer`s to mock external services (Gmail, Webhooks) resulting in blazing-fast, deterministic API tests (`apps/api/src/server.test.ts`).
- **Database Hardening:** High-fidelity, isolated database testing spins up real PostgreSQL instances, applies Drizzle migrations, and asserts against actual indexes and queries (`packages/db/src/read-model.test.ts`).

However, to ensure reliability in a distributed, asynchronous production environment interacting with third-party APIs, the following testing layers must be implemented.

---

## 2. End-to-End (E2E) Sandbox Testing

**Objective:** Prove that the entire distributed pipeline (Gmail -> Poller/Worker -> DB -> Webhook) works holistically without mocks.

### Requirements:

- **Sandbox Accounts:** Maintain dedicated test Gmail accounts specifically for automated testing.
- **Workflow Verification:**
  1. Authenticate a sandbox mailbox.
  2. Programmatically send an email to the sandbox account.
  3. Wait for the `worker` (`apps/worker`) to process the incoming webhook or sync job.
  4. Assert that the `worker` successfully processes the thread and emits a `message.created` webhook to a local mock HTTP server (e.g., WireMock or MSW).
- **Execution:** Run nightly or on pre-merge to `main` due to API latency and rate limits.

---

## 3. Resilience & Contract Testing (Fault Injection)

**Objective:** Ensure the system respects third-party limits and degrades gracefully when external services fail.

### Requirements:

- **Gmail API Faults:**
  - Mock the Gmail API to return HTTP `429 Too Many Requests` and `503 Service Unavailable`.
  - Assert that the `MailboxSyncProvider` surfaces the error and the queue mechanism triggers exponential backoff without dropping the sync job.
  - Mock an `invalid_grant` response on token refresh. Assert the mailbox transitions to the `reconnect_required` state (`runMailboxSync` logic).
- **Webhook Delivery Faults:**
  - Simulate customer webhook endpoints returning HTTP `500` or timing out (the "Tarpit" scenario).
  - Assert that `runWebhookDelivery` properly captures the failure (`WebhookDeliverySendFailure`), schedules a retry based on `calculateWebhookDeliveryRetryDelayMs`, and respects `DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS` (5 attempts).

---

## 4. Chaos Testing (Infrastructure Failures)

**Objective:** Prove the deployed system survives infrastructure outages and recovers without data loss or duplicate event emissions.

### Requirements:

- **The "Dead Worker" (Lease Recovery):**
  - **Scenario:** Violently kill (`SIGKILL`) a worker container in the middle of executing `runMailboxSync`.
  - **Assertion:** The `activeSyncLeaseOwner` lock in Postgres must expire after `DEFAULT_MAILBOX_SYNC_LEASE_TTL_MS` (90s). A new worker must successfully acquire the lease and resume the sync.
- **The "Flaky Database":**
  - **Scenario:** Inject high latency (5s+) or randomly drop TCP connections to the PostgreSQL database using a tool like Toxiproxy.
  - **Assertion:** Effect runtimes must gracefully handle the connection failure, and the Google Cloud Tasks queue must automatically retry the HTTP dispatch to the worker.

---

## 5. Load & Performance Testing

**Objective:** Identify bottlenecks in database concurrency and worker memory usage under high volume.

### Requirements:

- **High-Throughput Syncs:** Simulate the dispatch of 10,000 concurrent `MailboxSyncJobData` requests to the local worker via the `LocalAsyncTransport`.
- **Assertion:** Monitor PostgreSQL connection pool limits and verify that the Effect `MailboxSyncCoordinator` does not experience deadlock when acquiring leases.
- **Tools:** Use tools like **k6** or **Artillery** targeting the `/internal/sync` and `/internal/webhook-deliveries` endpoints.

---

## 6. Deterministic Simulation Testing (DST)

**Objective:** Uncover rare race conditions in the state machine (Lease ownership, Webhook ordering) using property-based testing.

### Requirements:

- Leverage `@effect/test` and `TestClock` combined with `fast-check`.
- **Concurrency Simulation:** Spin up multiple simulated concurrent workers attempting to execute `runMailboxSync` for the exact same `mailboxId`.
- **Assertion:** Ensure that exactly _one_ worker acquires the lease, while the others immediately skip (`skipped_due_to_active_lease`).
- **Event Ordering:** Generate random incoming Gmail history changes out of order. Assert that the `toSyncSnapshot` and DB application logic results in an eventually consistent state matching the Gmail remote state.

---

## 7. CI/CD Enforcement

- Add strict code coverage enforcement via `@vitest/coverage-v8` in `vitest.config.ts`.
- Require `100%` coverage on critical domain logic inside `packages/core/src/use-cases.ts` (specifically lease management and webhook delivery retry logic).
- Run the isolated PostgreSQL tests natively in CI using Service Containers (e.g., GitHub Actions `services: postgres:16`).
