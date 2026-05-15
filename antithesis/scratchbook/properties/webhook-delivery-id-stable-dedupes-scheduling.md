# webhook-delivery-id-stable-dedupes-scheduling

## Evidence Trail

- `createStableWebhookDeliveryId` hashes `(mailboxEventId, webhookEndpointId)` into `del_...`.
- `webhook_deliveries` has a unique constraint on `(mailbox_event_id, webhook_endpoint_id)`.
- Live event scheduling uses `onConflictDoNothing`; replay scheduling uses `onConflictDoUpdate` to reset delivery state.

## Failure Scenario

Generate event IDs, endpoint IDs, subscription sets, duplicate event inputs, and repeated scheduling calls. There must be one durable delivery per event/endpoint pair.

## PBT Implementation Notes

Use Hegel with DB-backed tests. Seed generated subscriptions and events, call `createWebhookDeliveriesForMailboxEvents` repeatedly, and assert uniqueness plus stable IDs.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point: every returned delivery request ID equals `createStableWebhookDeliveryId(eventId, endpointId)`.

## Open Questions

- None
