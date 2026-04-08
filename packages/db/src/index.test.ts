import { describe, expect, it } from "vitest";

import {
  bootstrap,
  createCorePersistenceLayer,
  createMailboxQueryCatalogLayer,
  createWorkerPersistenceLayer,
  MailmonDatabase,
  schema,
} from "./index.js";

describe("schema", () => {
  it("exports the bootstrap and mailbox tables", () => {
    expect(schema.bootstrapState).toBeDefined();
    expect(schema.mailboxes).toBeDefined();
    expect(schema.gmailMailboxCredentials).toBeDefined();
    expect(schema.threads).toBeDefined();
    expect(schema.messages).toBeDefined();
    expect(schema.syncRuns).toBeDefined();
    expect(schema.mailboxEvents).toBeDefined();
    expect(schema.mailboxes.cursor).toBeDefined();
    expect(schema.mailboxes.activeSyncLeaseOwner).toBeDefined();
    expect(schema.mailboxes.activeSyncLeaseExpiresAt).toBeDefined();
    expect(schema.syncRuns.leaseOwnerId).toBeDefined();
  });

  it("exports DB-backed core persistence helpers", () => {
    expect(createCorePersistenceLayer).toBeDefined();
    expect(createMailboxQueryCatalogLayer).toBeDefined();
    expect(createWorkerPersistenceLayer).toBeDefined();
    expect(MailmonDatabase).toBeDefined();
  });
});

describe("bootstrap", () => {
  it("exports a default mailbox fixture", () => {
    expect(bootstrap.defaultBootstrapMailbox.id).toBe("mbx_demo");
  });
});
