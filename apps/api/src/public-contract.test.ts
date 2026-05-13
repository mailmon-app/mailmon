import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { generateOpenApiDocument } from "./generate-openapi.js";
import { normalizeOpenApiDocument } from "./http/openapi-normalization.js";

type JsonObject = Record<string, unknown>;

const repoFile = (path: string) => {
  return fileURLToPath(new URL(`../../../${path}`, import.meta.url));
};

const readRepoText = (path: string) => {
  return readFileSync(repoFile(path), "utf8");
};

const isJsonObject = (value: unknown): value is JsonObject => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const asObject = (value: unknown): JsonObject => {
  if (!isJsonObject(value)) {
    throw new Error("Expected a JSON object.");
  }

  return value;
};

const schemaAt = (document: JsonObject, path: ReadonlyArray<string>) => {
  let value: unknown = document;

  for (const segment of path) {
    value = asObject(value)[segment];
  }

  return asObject(value);
};

describe("public API contract", () => {
  it("keeps generated OpenAPI in sync with the checked-in docs artifact", async () => {
    const checkedInDocument = asObject(
      JSON.parse(readRepoText("apps/docs/api-reference/openapi.json")),
    );

    await expect(generateOpenApiDocument()).resolves.toEqual(checkedInDocument);
  });

  it("keeps the checked-in OpenAPI document on the v1 camelCase JSON shape", () => {
    const document = asObject(JSON.parse(readRepoText("apps/docs/api-reference/openapi.json")));

    const connectSessionRequest = schemaAt(document, [
      "paths",
      "/v1/mailboxes/connect-sessions",
      "post",
      "requestBody",
      "content",
      "application/json",
      "schema",
    ]);

    expect(connectSessionRequest).toMatchObject({
      required: ["provider", "tenantExternalId", "mailboxExternalId", "redirectUrl"],
      properties: {
        tenantExternalId: expect.any(Object),
        mailboxExternalId: expect.any(Object),
        redirectUrl: expect.any(Object),
      },
    });
    expect(connectSessionRequest.properties).not.toHaveProperty("tenant_external_id");

    const replayOperation = schemaAt(document, ["paths", "/v1/replays", "post"]);
    expect(replayOperation.responses).toHaveProperty("201");
    expect(replayOperation.responses).not.toHaveProperty("202");

    const replayRequest = schemaAt(replayOperation, [
      "requestBody",
      "content",
      "application/json",
      "schema",
    ]);

    expect(replayRequest).toMatchObject({
      required: ["mailboxId", "webhookEndpointId", "startTime", "endTime"],
      properties: {
        mailboxId: expect.any(Object),
        webhookEndpointId: expect.any(Object),
        startTime: expect.any(Object),
        endTime: expect.any(Object),
      },
    });
    expect(replayRequest.properties).not.toHaveProperty("destination");
    expect(replayRequest.properties).not.toHaveProperty("webhook_endpoint_id");

    const messageSchema = schemaAt(document, [
      "paths",
      "/v1/messages",
      "get",
      "responses",
      "200",
      "content",
      "application/json",
      "schema",
      "properties",
      "data",
      "items",
    ]);

    expect(messageSchema.required).toContain("labelIds");
    expect(asObject(document.paths)).not.toHaveProperty("/v1/labels");
  });

  it("keeps public examples off deprecated v1 field names", () => {
    const publicDocs = [
      "docs/PRD.md",
      "README.md",
      "apps/docs/quickstart.mdx",
      "apps/docs/guides/replays.mdx",
      "sdks/typescript/README.md",
    ]
      .map((path) => readRepoText(path))
      .join("\n");

    for (const deprecatedToken of [
      '"tenant_external_id"',
      '"mailbox_external_id"',
      '"redirect_url"',
      '"connect_url"',
      '"expires_at"',
      '"webhook_endpoint_id"',
      '"start_time"',
      '"end_time"',
      '"events_replayed"',
      '"destination"',
      "202 Accepted",
    ]) {
      expect(publicDocs).not.toContain(deprecatedToken);
    }
  });
});

describe("OpenAPI normalization policy", () => {
  it("prefers camelCase request schemas over snake_case compatibility aliases", () => {
    const document = normalizeOpenApiDocument({
      paths: {
        "/v1/mailboxes/connect-sessions": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    anyOf: [
                      {
                        type: "object",
                        required: ["tenant_external_id"],
                        properties: {
                          tenant_external_id: { type: "string" },
                        },
                      },
                      {
                        type: "object",
                        required: ["tenantExternalId"],
                        properties: {
                          tenantExternalId: { type: "string" },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    });

    const requestSchema = schemaAt(document, [
      "paths",
      "/v1/mailboxes/connect-sessions",
      "post",
      "requestBody",
      "content",
      "application/json",
      "schema",
    ]);

    expect(requestSchema).toEqual({
      type: "object",
      required: ["tenantExternalId"],
      properties: {
        tenantExternalId: { type: "string" },
      },
    });
  });

  it("keeps nullable anyOf schemas intact", () => {
    const document = normalizeOpenApiDocument({
      components: {
        schemas: {
          NullableRedirectUrl: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
        },
      },
    });

    expect(schemaAt(document, ["components", "schemas", "NullableRedirectUrl"])).toEqual({
      anyOf: [{ type: "string" }, { type: "null" }],
    });
  });

  it("removes snake_case mailbox query aliases and normalizes limit parameters", () => {
    const document = normalizeOpenApiDocument({
      paths: {
        "/v1/messages": {
          get: {
            parameters: [
              { name: "mailbox_id", in: "query", schema: { type: "string" } },
              { name: "mailboxId", in: "query", required: false, schema: { type: "string" } },
              {
                name: "limit",
                in: "query",
                description: "Generated limit description",
                schema: { type: "number" },
              },
            ],
          },
        },
        "/v1/replays": {
          get: {
            parameters: [
              { name: "mailboxId", in: "query", required: false, schema: { type: "string" } },
            ],
          },
        },
      },
    });

    const messageOperation = schemaAt(document, ["paths", "/v1/messages", "get"]);
    const replayOperation = schemaAt(document, ["paths", "/v1/replays", "get"]);

    expect(messageOperation.parameters).toEqual([
      { name: "mailboxId", in: "query", required: true, schema: { type: "string" } },
      { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
    ]);
    expect(replayOperation.parameters).toEqual([
      { name: "mailboxId", in: "query", required: false, schema: { type: "string" } },
    ]);
  });

  it("lifts JSON Schema $defs into OpenAPI components", () => {
    const document = normalizeOpenApiDocument({
      paths: {
        "/v1/messages": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      $defs: {
                        Message: {
                          type: "object",
                          $defs: {
                            Label: { type: "string" },
                          },
                        },
                      },
                      properties: {
                        data: { $ref: "#/$defs/Message" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const responseSchema = schemaAt(document, [
      "paths",
      "/v1/messages",
      "get",
      "responses",
      "200",
      "content",
      "application/json",
      "schema",
    ]);

    expect(responseSchema).not.toHaveProperty("$defs");
    expect(schemaAt(document, ["components", "schemas", "Message"])).toEqual({
      type: "object",
    });
    expect(schemaAt(document, ["components", "schemas", "Label"])).toEqual({ type: "string" });
  });
});
