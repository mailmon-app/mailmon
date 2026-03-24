import { describe, expect, it } from "vitest";

import { bootstrap, schema } from "./index.js";

describe("schema", () => {
  it("exports the bootstrap and mailbox tables", () => {
    expect(schema.bootstrapState).toBeDefined();
    expect(schema.mailboxes).toBeDefined();
    expect(schema.syncRuns).toBeDefined();
    expect(schema.mailboxEvents).toBeDefined();
  });
});

describe("bootstrap", () => {
  it("exports a default mailbox fixture", () => {
    expect(bootstrap.defaultBootstrapMailbox.id).toBe("mbx_demo");
  });
});
