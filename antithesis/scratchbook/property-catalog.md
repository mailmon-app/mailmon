---
sut_path: /home/satty/projects/mailmon-dev
commit: a4771cd562e5e48b412528096145a598a04de828
updated: 2026-05-16
external_references:
  - path: https://github.com/hegeldev/hegel-typescript
    why: User-requested TypeScript property-based testing client; inspected README and source at e58959ae567cf49aaddabe2e04a5819c8e6f6850.
  - path: https://github.com/antithesishq/bombadil
    why: User-requested browser/UI property-based testing tool; inspected README and manual at ad98c7b5c36c6889dd05db4f08034b48374dda4a.
  - path: https://antithesis.com/docs/properties_assertions/assertions/
    why: Assertion taxonomy and property semantics used to classify properties.
  - path: https://antithesis.com/docs/best_practices/sometimes_assertions/
    why: Guidance for reachability/liveness-style properties.
  - path: https://antithesis.com/docs/using_antithesis/sdk/
    why: SDK runtime behavior and future portability notes.
  - path: https://antithesis.com/docs/using_antithesis/sdk/define_test_properties/
    why: Test property definition and assertion cataloging context.
  - path: https://antithesis.com/docs/using_antithesis/sdk/javascript_sdk/
    why: TypeScript/JavaScript instrumentation constraints for future platform use.
  - path: https://antithesis.com/docs/best_practices/optimizing/
    why: Test-environment tuning guidance.
---

# Property Catalog

## Summary

This catalog is local PBT first. Hegel should own backend properties through Vitest. Bombadil should own browser-facing docs/marketing properties. Antithesis assertion names are included as semantic labels and future-portability hints, not as a platform dependency.

## Mailbox Sync And Cursor Safety

### mailbox-lease-single-flight - Mailbox Lease Single Flight

|                      |                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                                                                         |
| **Priority**         | High                                                                                                                                                                                                                                                           |
| **Property**         | For one mailbox and many concurrent sync attempts, at most one attempt applies a provider snapshot while the rest skip or fail without mutating canonical state.                                                                                               |
| **Invariant**        | `Always`: after generated concurrent `runMailboxSync` attempts, there is at most one applied sync run for a lease interval and no skipped run advances cursor or emits events. Hegel should generate worker counts, provider delays, and acquisition outcomes. |
| **Antithesis Angle** | Duplicate Gmail wake-ups and transport retries can arrive at the same time; partial failure can leave one worker slow while another starts.                                                                                                                    |
| **Why It Matters**   | The README and PRD claim one sync per mailbox and say queue ordering is not trusted. This is the central correctness rule.                                                                                                                                     |

**Open Questions:**

- None

### lease-loss-prevents-stale-commit - Lease Loss Prevents Stale Commit

|                      |                                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                                                  |
| **Priority**         | High                                                                                                                                                                                                                                    |
| **Property**         | A sync worker that loses its mailbox lease cannot apply canonical state, emit mailbox events, or advance the cursor.                                                                                                                    |
| **Invariant**        | `Always`: if `applySyncResult` is called with an expired or wrong lease owner, the result is not applied and the mailbox row, sync run, messages, threads, and mailbox events remain unchanged except for expected failure bookkeeping. |
| **Antithesis Angle** | Worker pause, DB latency, or restart can make a stale worker finish after another owner has taken over.                                                                                                                                 |
| **Why It Matters**   | This guards against state corruption from worker crashes and slow commits.                                                                                                                                                              |

**Open Questions:**

- None

### cursor-never-regresses - Cursor Never Regresses

|                      |                                                                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                                                                                                      |
| **Priority**         | High                                                                                                                                                                                                                                                                                        |
| **Property**         | Applying a sync result never moves a mailbox cursor backward.                                                                                                                                                                                                                               |
| **Invariant**        | `Always`: for generated current and next cursors, decimal regressions, `null` next cursors, and same-prefix ordinal regressions fail with `mailbox_cursor_regressed`; successful commits leave the stored cursor greater than or equal to the previous cursor under local comparison rules. |
| **Antithesis Angle** | Out-of-order history fetches and retried older jobs can race with newer commits.                                                                                                                                                                                                            |
| **Why It Matters**   | Bad cursor handling is a named production failure mode in the PRD.                                                                                                                                                                                                                          |

**Open Questions:**

- None

### state-cursor-events-commit-atomically - State Cursor Events Commit Atomically

|                      |                                                                                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                                                                                                       |
| **Priority**         | High                                                                                                                                                                                                                                                                                         |
| **Property**         | Canonical message/thread state, mailbox events, sync run completion, and cursor advancement commit as one unit.                                                                                                                                                                              |
| **Invariant**        | `Always`: after any generated successful `applySyncResult`, the stored cursor equals `nextCursor`, the completed sync run records the same cursor and event count, and every emitted event references canonical state in the same transaction result. Failed commits leave no partial state. |
| **Antithesis Angle** | DB faults and worker termination can happen between fetch, state write, event insert, and cursor update.                                                                                                                                                                                     |
| **Why It Matters**   | The README explicitly says "State first, cursor second"; the implementation performs this in one DB transaction.                                                                                                                                                                             |

**Open Questions:**

- None

### sync-snapshot-application-is-idempotent - Sync Snapshot Application Is Idempotent

|                      |                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                                                              |
| **Priority**         | High                                                                                                                                                                                                                                                |
| **Property**         | Reapplying semantically identical sync snapshots does not duplicate canonical rows or mailbox events.                                                                                                                                               |
| **Invariant**        | `Always`: for generated snapshots applied twice with advancing non-regressing cursors, message/thread row counts remain set-like by provider IDs and the second application emits no new message/thread events when canonical content is unchanged. |
| **Antithesis Angle** | Duplicate push notifications and retried jobs can replay the same provider state.                                                                                                                                                                   |
| **Why It Matters**   | At-least-once delivery and duplicate notifications are core product assumptions.                                                                                                                                                                    |

**Open Questions:**

- None

## Gmail History And Canonical Projection

### history-delete-wins-compaction - Gmail History Delete Wins Compaction

|                      |                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Type**             | Safety                                                                                                                                                                                                                               |
| **Priority**         | High                                                                                                                                                                                                                                 |
| **Property**         | If Gmail history contains add/update and delete records for the same message in one delta, the deleted result wins.                                                                                                                  |
| **Invariant**        | `Always`: for generated history record sequences, a message ID that appears in `messagesDeleted` is included in `deletedMessageIds` and excluded from fetched changed messages, regardless of earlier add/label events in the delta. |
| **Antithesis Angle** | Gmail history pages can contain duplicates and mixed operations; provider retries can expose unusual ordering.                                                                                                                       |
| **Why It Matters**   | Delete/update ordering bugs create resurrected messages or missed deletions.                                                                                                                                                         |

**Open Questions:**

- None

### initial-sync-catchup-delete-wins - Initial Sync Catch-Up Delete Wins

|                      |                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                                    |
| **Priority**         | High                                                                                                                                                                                                                      |
| **Property**         | During initial sync, catch-up deleted message IDs remove baseline messages and suppress catch-up messages with the same IDs.                                                                                              |
| **Invariant**        | `Always`: for generated baseline message sets and catch-up deltas, `mergeInitialSyncMessages` returns one record per non-deleted provider message ID and never returns a message whose ID is in the catch-up deleted set. |
| **Antithesis Angle** | A message can be deleted between baseline list and catch-up history fetch.                                                                                                                                                |
| **Why It Matters**   | Initial sync is a race between snapshot and history boundary.                                                                                                                                                             |

**Open Questions:**

- None

### thread-summary-follows-latest-message - Thread Summary Follows Latest Message

|                      |                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                           |
| **Priority**         | High                                                                                                                                                                                                             |
| **Property**         | A canonical thread summary always reflects the latest remaining message in that provider thread.                                                                                                                 |
| **Invariant**        | `Always`: for generated message sets and deletion sequences, thread `lastMessageAt`, `subject`, and `id` equal the newest non-deleted message chosen by `(receivedAt desc, id desc)` after commit recalculation. |
| **Antithesis Angle** | Deletes and updates can hit the newest message while older messages remain.                                                                                                                                      |
| **Why It Matters**   | Thread list correctness is user-visible and can be corrupted by delete-only deltas.                                                                                                                              |

**Open Questions:**

- None

### label-ids-are-normalized - Label IDs Are Normalized

|                      |                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                              |
| **Priority**         | Medium                                                                                                                              |
| **Property**         | Message `labelIds` are stored and emitted as sorted unique sets.                                                                    |
| **Invariant**        | `Always`: generated label arrays with duplicates and random order normalize identically in message rows and mailbox event payloads. |
| **Antithesis Angle** | Reordered provider labels should not create false updates or duplicate events.                                                      |
| **Why It Matters**   | Labels are not a first-class v1 resource, so message payload label stability is the customer-visible contract.                      |

**Open Questions:**

- None

## Webhooks And Replay

### webhook-delivery-id-stable-dedupes-scheduling - Webhook Delivery ID Stable Dedupes Scheduling

|                      |                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Type**             | Safety                                                                                                                                                                                                             |
| **Priority**         | High                                                                                                                                                                                                               |
| **Property**         | The same mailbox event and webhook endpoint pair maps to exactly one durable delivery, even under duplicate scheduling.                                                                                            |
| **Invariant**        | `Always`: generated event/endpoint pairs create stable `del_...` IDs; repeated `createWebhookDeliveriesForMailboxEvents` calls never create duplicate rows for the same `(mailbox_event_id, webhook_endpoint_id)`. |
| **Antithesis Angle** | Sync commits, replay, and recovery can schedule delivery for the same event more than once.                                                                                                                        |
| **Why It Matters**   | Durable at-least-once delivery must not become unbounded duplicate delivery.                                                                                                                                       |

**Open Questions:**

- None

### webhook-claim-is-exclusive-and-stale-recoverable - Webhook Claim Is Exclusive And Stale Recoverable

|                      |                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                                                                         |
| **Priority**         | High                                                                                                                                                                                                                                                           |
| **Property**         | A webhook delivery can be claimed by only one live attempt, and stale processing attempts become reclaimable after the processing timeout.                                                                                                                     |
| **Invariant**        | `Always`: for generated claim attempts and timestamps, at most one non-stale processing claim succeeds; a processing row older than `WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS` can be reclaimed and increments `attemptCount` exactly once per successful claim. |
| **Antithesis Angle** | Cloud Tasks or local retries can invoke the same delivery concurrently or after worker death.                                                                                                                                                                  |
| **Why It Matters**   | This is the webhook delivery equivalent of mailbox single-flight.                                                                                                                                                                                              |

**Open Questions:**

- None

### webhook-retry-delay-bounded-monotonic - Webhook Retry Delay Bounded Monotonic

|                      |                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Type**             | Safety                                                                                                                                                                                                                                                 |
| **Priority**         | High                                                                                                                                                                                                                                                   |
| **Property**         | Retryable webhook failures schedule the next attempt with monotonic exponential delay capped at the maximum, until retry exhaustion.                                                                                                                   |
| **Invariant**        | `Always`: generated attempt counts and retryable failure modes produce `pending` completions with nondecreasing `nextAttemptAt` delays below or equal to 15 minutes; attempts at or above max produce terminal `failed` or `retry_exhausted` outcomes. |
| **Antithesis Angle** | Endpoint failures, timeouts, and repeated task retries stress retry state and endpoint health transitions.                                                                                                                                             |
| **Why It Matters**   | Incorrect retries either drop events or create retry storms.                                                                                                                                                                                           |

**Open Questions:**

- None

### terminal-webhook-outcomes-do-not-reschedule - Terminal Webhook Outcomes Do Not Reschedule

|                      |                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                  |
| **Priority**         | Medium                                                                                                                                                                                                  |
| **Property**         | Delivered, nonretryable failed, and retry-exhausted webhook outcomes never schedule another delivery attempt.                                                                                           |
| **Invariant**        | `Always`: generated HTTP status codes and sender failures classify terminal outcomes with `nextAttemptAt: null`, and `finalizeWebhookDelivery` schedules follow-up work only for `pending` completions. |
| **Antithesis Angle** | Mixed customer endpoint responses can otherwise create impossible terminal-plus-pending states.                                                                                                         |
| **Why It Matters**   | Prevents duplicate terminal sends and confusing observability state.                                                                                                                                    |

**Open Questions:**

- None

### replay-active-ranges-do-not-overlap - Replay Active Ranges Do Not Overlap

|                      |                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                    |
| **Priority**         | High                                                                                                                                                                                      |
| **Property**         | A mailbox/webhook endpoint cannot have overlapping queued or running replay ranges.                                                                                                       |
| **Invariant**        | `Always`: generated replay create requests for the same workspace, mailbox, and endpoint either create non-overlapping jobs or fail with replay conflict when ranges overlap active jobs. |
| **Antithesis Angle** | Concurrent replay creation can race before one transaction observes the other.                                                                                                            |
| **Why It Matters**   | Overlapping replay can redeliver historical events ambiguously.                                                                                                                           |

**Open Questions:**

- None

### replay-dispatch-is-single-claim-and-counted - Replay Dispatch Is Single Claim And Counted

|                      |                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                                 |
| **Priority**         | Medium                                                                                                                                                                                                                 |
| **Property**         | Each queued replay is claimed once, schedules deliveries for exactly the selected event IDs, and records the delivered count consistently.                                                                             |
| **Invariant**        | `Always`: generated queued replays and event logs dispatch with at most one `running` transition; `eventsReplayed` equals the number of delivery requests created for event IDs in ascending `(occurredAt, id)` order. |
| **Antithesis Angle** | Control jobs can run concurrently; scheduling can partially fail.                                                                                                                                                      |
| **Why It Matters**   | Replay is the recovery path for missed or failed webhooks.                                                                                                                                                             |

**Open Questions:**

- None

## Worker Protocol And Public Reads

### internal-worker-codecs-reject-malformed-envelopes - Internal Worker Codecs Reject Malformed Envelopes

|                      |                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                         |
| **Priority**         | Medium                                                                                                                                                                                                         |
| **Property**         | Worker internal codecs accept only valid direct, Pub/Sub, and dead-letter payloads and preserve normalized fields.                                                                                             |
| **Invariant**        | `Always`: generated unknown JSON, invalid base64, missing data, empty IDs, numeric Gmail `historyId`, and valid envelopes decode to either a specific error string or a normalized request with non-empty IDs. |
| **Antithesis Angle** | Cloud Pub/Sub push, dead-letter replay, and local mode all hit the same HTTP worker routes with different envelope shapes.                                                                                     |
| **Why It Matters**   | Bad decode behavior can silently drop work or accept malformed work.                                                                                                                                           |

**Open Questions:**

- None

### gmail-push-is-wakeup-only-and-fans-out - Gmail Push Is Wake-Up Only And Fans Out

|                      |                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                           |
| **Priority**         | Medium                                                                                                                                                                           |
| **Property**         | A Gmail push notification dispatches sync for matching mailboxes but does not itself mutate canonical mailbox state.                                                             |
| **Invariant**        | `Always`: generated notification-to-mailbox mappings produce exactly one dispatch per listed mailbox and no direct state/event/cursor writes from `ingestGmailPushNotification`. |
| **Antithesis Angle** | Duplicate push notifications and synthetic Pub/Sub messages are common; push must remain a wake-up.                                                                              |
| **Why It Matters**   | The PRD says Gmail push is not truth.                                                                                                                                            |

**Open Questions:**

- None

### pagination-cursors-roundtrip-and-reject-junk - Pagination Cursors Round Trip And Reject Junk

|                      |                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety                                                                                                                                                                                                |
| **Priority**         | Medium                                                                                                                                                                                                |
| **Property**         | Pagination cursors round-trip valid `(timestamp, id)` positions and reject malformed or impossible cursor payloads.                                                                                   |
| **Invariant**        | `Always`: generated valid cursors decode to the original position; generated invalid prefixes, invalid base64, invalid JSON, empty IDs, and invalid timestamps fail with `invalid_pagination_cursor`. |
| **Antithesis Angle** | API clients can replay stale, malformed, or fuzzed cursors under load.                                                                                                                                |
| **Why It Matters**   | Bad pagination can duplicate or skip messages/threads.                                                                                                                                                |

**Open Questions:**

- None

## Browser-Facing Bombadil Properties

### docs-browser-navigation-has-no-runtime-errors - Docs Browser Navigation Has No Runtime Errors

|                      |                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**             | Safety / Reachability                                                                                                                                                                                                           |
| **Priority**         | Low                                                                                                                                                                                                                             |
| **Property**         | Random docs navigation and interaction should not produce HTTP error pages, uncaught exceptions, unhandled promise rejections, or console errors.                                                                               |
| **Invariant**        | `Always` in Bombadil: re-export default properties and add route-specific extractors for Mailmon docs navigation. `Reachable`: API reference pages, Quickstart, Webhooks, and Replay docs should all be reachable during a run. |
| **Antithesis Angle** | Not a backend fault property. This is local/CI browser PBT for the integration surface customers read.                                                                                                                          |
| **Why It Matters**   | Docs are part of launch readiness and the first-webhook workflow.                                                                                                                                                               |

**Open Questions:**

- None

## Assumptions

- Hegel should replace the roadmap's fast-check idea unless a future decision says otherwise.
- Hegel's current Antithesis integration emits only an `Always` aggregate for a test function, so local test names and failure messages must stay specific.
- Bombadil is experimental and should stay isolated from core PR-time tests until stable in CI.

## Open Questions

- None.
