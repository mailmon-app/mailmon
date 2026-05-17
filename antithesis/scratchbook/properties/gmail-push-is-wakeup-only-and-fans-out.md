# gmail-push-is-wakeup-only-and-fans-out

## Evidence Trail

- `ingestGmailPushNotification` asks `MailboxPushNotificationStore` for matching mailboxes and calls `MailboxSyncDispatcher.dispatchMailboxSync` for each.
- The function returns dispatched count, email address, history ID, kind, and status.
- It does not call `MailboxStateStore`, Gmail APIs, or event stores.

## Failure Scenario

Generate push notifications and matching mailbox lists, including duplicates if the store returns them. The function must dispatch exactly the returned list and must not mutate canonical state directly.

## PBT Implementation Notes

Implemented with Hegel in `packages/core/src/gmail-push-notification.pbt.test.ts`.
The success property generates Gmail push notifications plus zero to eight returned
mailboxes from a small ID domain so duplicate mailbox IDs occur naturally. It
asserts `dispatched` and dispatcher calls are derived from the same generated
store result. The failure property generates a non-empty mailbox list and a
failing dispatcher mailbox ID, then asserts the dispatcher failure propagates.

## SUT-Side Instrumentation

Covered at the service boundary by fake `MailboxPushNotificationStore` and
`MailboxSyncDispatcher` layers. The test intentionally does not provide
`MailboxStateStore`, Gmail API, or event-store layers, so direct mutation
dependencies would fail layer resolution.

## Open Questions

- None
