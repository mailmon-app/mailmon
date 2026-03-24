import { bootstrap } from "@mailmon/db";
import { createStubMailboxSyncProviderLayer } from "@mailmon/gmail";
import { Layer } from "effect";

export const workerRuntimeLayer = Layer.mergeAll(
  bootstrap.createBootstrapMailboxCatalogLayer(),
  bootstrap.createBootstrapMailboxSyncCoordinatorLayer,
  bootstrap.createBootstrapSyncRunStoreLayer,
  createStubMailboxSyncProviderLayer,
);
