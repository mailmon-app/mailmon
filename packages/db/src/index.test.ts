import { describe, expect, it } from "vitest";

import { schema } from "./index.js";

describe("schema", () => {
  it("exports the bootstrap table", () => {
    expect(schema.bootstrapState).toBeDefined();
  });
});
