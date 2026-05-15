# gmail-push-is-wakeup-only-and-fans-out

## Evidence Trail

- `ingestGmailPushNotification` asks `MailboxPushNotificationStore` for matching mailboxes and calls `MailboxSyncDispatcher.dispatchMailboxSync` for each.
- The function returns dispatched count, email address, history ID, kind, and status.
- It does not call `MailboxStateStore`, Gmail APIs, or event stores.

## Failure Scenario

Generate push notifications and matching mailbox lists, including duplicates if the store returns them. The function must dispatch exactly the returned list and must not mutate canonical state directly.

## PBT Implementation Notes

Use Hegel with fake store/dispatcher layers. Generate mailbox lists and dispatcher failure modes in separate properties: one for successful fanout, one for propagation of dispatch failures.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point: accepted Gmail push result `dispatched` equals the number of dispatch calls made by the dispatcher.

## Open Questions

- None
