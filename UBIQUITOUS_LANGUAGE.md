# Ubiquitous Language

## Core domain

| Term                        | Definition                                                                                            | Aliases to avoid              |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Mailmon**                 | A Gmail-first sync and state infrastructure that provides correct mailbox state and replayable events | Email API, inbox API          |
| **Mailbox**                 | A connected Gmail mailbox that owns sync state, watch state, and a cursor                             | Account, inbox, Gmail account |
| **Workspace**               | The top-level tenant boundary that owns mailboxes, webhook endpoints, replay jobs, and events         | Project, tenant               |
| **Provider**                | The external mail system Mailmon syncs against                                                        | Integration, backend          |
| **Gmail**                   | The v1 provider implementation and source of truth for mailbox changes                                | Email provider                |
| **Canonical Mailbox State** | Mailmon’s normalized durable representation of mailbox messages, threads, and labels                  | Cache, mirror                 |
| **Cursor**                  | The durable sync position for a mailbox used to continue incremental sync                             | Offset, checkpoint            |
| **historyId**               | Gmail’s ordered change-log position used as the source-of-truth incremental cursor                    | Event ID, sequence number     |

## Sync and delivery

| Term                  | Definition                                                                                  | Aliases to avoid              |
| --------------------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| **Initial Sync**      | The first full reconstruction of mailbox state before incremental sync begins               | Import, bootstrap sync        |
| **Incremental Sync**  | A mailbox sync that applies Gmail history changes since the stored cursor                   | Delta sync, polling pass      |
| **Sync Run**          | A recorded execution of mailbox synchronization for one mailbox                             | Job, attempt                  |
| **Single-flight**     | The guarantee that only one active sync executes for a mailbox at a time                    | Lock, mutex                   |
| **Mailbox Event**     | An immutable domain event emitted from durable mailbox state changes                        | Notification, webhook payload |
| **Webhook Delivery**  | One delivery attempt of a mailbox event to a customer webhook endpoint                      | Callback, push                |
| **Replay**            | Deterministic re-delivery of stored mailbox events for a mailbox and time range             | Reprocess, resend             |
| **Push Notification** | A wake-up signal that tells Mailmon to sync a mailbox but is not itself the source of truth | Event, change record          |

## Public API and integration

| Term                 | Definition                                                                   | Aliases to avoid              |
| -------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| **API Key**          | A workspace-scoped secret used to authenticate Mailmon’s server-side API     | Token, credential             |
| **Connect Session**  | A short-lived resource that starts a Mailmon-hosted Gmail authorization flow | OAuth session, auth link      |
| **Webhook Endpoint** | A customer-managed destination that receives mailbox events                  | Webhook, callback URL         |
| **Subscription**     | The mailbox-scoped event selection attached to a webhook endpoint            | Listener, binding             |
| **Problem Envelope** | The structured synchronous API error document returned for request failures  | Error body, exception payload |

## State and resources

| Term               | Definition                                                                            | Aliases to avoid               |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------ |
| **Mailbox Status** | The top-level operational state of a mailbox such as `active` or `reconnect_required` | Health, lifecycle              |
| **Sync State**     | The current synchronization condition of a mailbox such as `healthy` or `lagging`     | Job state, worker status       |
| **Watch State**    | The current Gmail watch condition of a mailbox such as `active` or `expired`          | Subscription state, push state |
| **Last Error**     | The most recent operational failure recorded on a resource                            | Failure, exception             |
| **Message**        | The canonical email object stored by Mailmon                                          | Email, mail item               |
| **Thread**         | The canonical conversation grouping for related messages                              | Conversation                   |
| **Label**          | The canonical mailbox label state associated with a message                           | Tag, folder                    |

## Relationships

- A **Workspace** owns zero or more **Mailboxes**.
- A **Workspace** owns zero or more **Webhook Endpoints**.
- A **Mailbox** belongs to exactly one **Workspace**.
- A **Mailbox** has exactly one active **Cursor** at a time.
- A **Mailbox** produces zero or more **Sync Runs**.
- A **Mailbox** produces zero or more **Mailbox Events**.
- A **Mailbox Event** may produce zero or more **Webhook Deliveries**.
- A **Replay** targets exactly one **Mailbox** and one destination over a time range.
- A **Thread** belongs to exactly one **Mailbox**.
- A **Message** belongs to exactly one **Mailbox** and one **Thread**.

## Example dialogue

> **Dev:** "When a Gmail push arrives, do we create a **Mailbox Event** immediately?"
> **Domain expert:** "No. The push is only a **Push Notification**. We first run **Incremental Sync** for the **Mailbox** using the stored **Cursor**."
>
> **Dev:** "So the source of truth is the Gmail **historyId**, not the push payload?"
> **Domain expert:** "Exactly. The push only wakes the system up; Gmail history is the truth."
>
> **Dev:** "When do we emit a **Mailbox Event** then?"
> **Domain expert:** "Only after durable writes have updated the **Canonical Mailbox State**. Then the **Mailbox Event** can be delivered or used for **Replay**."
>
> **Dev:** "If the mailbox becomes unhealthy, is that an API error?"
> **Domain expert:** "No. A bad request gets a **Problem Envelope**. An unhealthy mailbox is represented on the **Mailbox** resource through **Mailbox Status**, **Sync State**, **Watch State**, and **Last Error**."

## Flagged ambiguities

- **"account"** was previously used where **Mailbox** is the correct term. Use **Mailbox** for the unit of work, the cursor owner, and the queue/job target.
- **"event"** is overloaded between Gmail change signals and Mailmon’s durable domain events. Use **Push Notification** for inbound wake-up signals and **Mailbox Event** for durable emitted events.
- **"error"** was used for both synchronous request failures and asynchronous operational degradation. Use **Problem Envelope** for synchronous API failures and **Last Error** for resource-level operational state.
- **"tenant"** appears in request fields such as `tenant_external_id`, but the internal ownership boundary in this system is **Workspace**. Keep **Workspace** as the canonical system term unless a separate customer-domain concept is introduced later.
- **"sync job"** and **"sync run"** are related but distinct. Use **Sync Run** for the recorded domain execution and reserve job language for queue transport concerns only.
