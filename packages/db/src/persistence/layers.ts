import { Layer } from "effect";

import { createMailboxConnectSessionStoreLayer } from "./connect-sessions.js";
import { createDatabaseLayer } from "./database.js";
import { createGmailMailboxCredentialStoreLayer } from "./gmail-credentials.js";
import {
  createMailboxCatalogLayer,
  createMailboxPushNotificationStoreLayer,
} from "./mailbox-catalog.js";
import { createMailboxExecutionRecoveryStoreLayer } from "./mailbox-execution-recovery-store.js";
import { createMailboxObservabilityCatalogLayer } from "./mailbox-observability-catalog.js";
import { createMailboxQueryCatalogLayer } from "./mailbox-query-catalog.js";
import { createMailboxRepairStoreLayer } from "./mailbox-repair-store.js";
import { createMailboxStateStoreLayer } from "./mailbox-state-store.js";
import {
  createMailboxSyncCoordinatorLayer,
  createMailboxSyncDispatchExhaustionStoreLayer,
} from "./mailbox-sync-coordinator.js";
import { createMailboxWatchStoreLayer } from "./mailbox-watch-store.js";
import { createReplayStoreLayer } from "./replays.js";
import { createSyncRunStoreLayer } from "./sync-runs.js";
import { createWebhookDeliveryStoreLayer } from "./webhook-deliveries.js";
import {
  createWebhookEndpointCatalogLayer,
  createWebhookEndpointStoreLayer,
  createWebhookEndpointSubscriptionStoreLayer,
} from "./webhook-endpoints.js";
import { createWorkspaceApiKeyStoreLayer } from "./workspace-api-keys.js";

export const createPersistenceServicesLayer = Layer.mergeAll(
  createMailboxCatalogLayer,
  createMailboxConnectSessionStoreLayer,
  createMailboxExecutionRecoveryStoreLayer,
  createMailboxObservabilityCatalogLayer,
  createMailboxPushNotificationStoreLayer,
  createMailboxQueryCatalogLayer,
  createMailboxRepairStoreLayer,
  createMailboxStateStoreLayer,
  createMailboxSyncCoordinatorLayer,
  createMailboxSyncDispatchExhaustionStoreLayer,
  createMailboxWatchStoreLayer,
  createReplayStoreLayer,
  createSyncRunStoreLayer,
  createWebhookDeliveryStoreLayer,
  createWebhookEndpointCatalogLayer,
  createWebhookEndpointStoreLayer,
  createWebhookEndpointSubscriptionStoreLayer,
  createWorkspaceApiKeyStoreLayer,
);

export const createCorePersistenceLayer = (connectionString: string) =>
  createPersistenceServicesLayer.pipe(Layer.provide(createDatabaseLayer(connectionString)));

export const createWorkerPersistenceLayer = (connectionString: string) =>
  Layer.mergeAll(createPersistenceServicesLayer, createGmailMailboxCredentialStoreLayer).pipe(
    Layer.provide(createDatabaseLayer(connectionString)),
  );
