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

const schemaAt = (document: JsonObject, path: ReadonlyArray<string | number>) => {
  let value: unknown = document;

  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(value)) {
        throw new Error("Expected a JSON array.");
      }

      value = value[segment];
      continue;
    }

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

    const connectSessionRequestRef = schemaAt(document, [
      "paths",
      "/v1/mailboxes/connect-sessions",
      "post",
      "requestBody",
      "content",
      "application/json",
      "schema",
    ]);
    expect(connectSessionRequestRef).toEqual({
      $ref: "#/components/schemas/CreateConnectSessionRequest",
    });

    const connectSessionRequest = schemaAt(document, [
      "components",
      "schemas",
      "CreateConnectSessionRequest",
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

    const replayRequestRef = schemaAt(replayOperation, [
      "requestBody",
      "content",
      "application/json",
      "schema",
    ]);
    expect(replayRequestRef).toEqual({ $ref: "#/components/schemas/CreateReplayRequest" });

    const replayRequest = schemaAt(document, ["components", "schemas", "CreateReplayRequest"]);

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
      "components",
      "schemas",
      "MessageList",
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

    expect(requestSchema).toEqual({ $ref: "#/components/schemas/CreateConnectSessionRequest" });
    expect(schemaAt(document, ["components", "schemas", "CreateConnectSessionRequest"])).toEqual({
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
              {
                name: "cursor",
                in: "query",
                schema: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
              {
                name: "mailboxId",
                in: "query",
                required: false,
                schema: {
                  anyOf: [{ type: "string", allOf: [{ minLength: 1 }] }, { type: "null" }],
                },
              },
              {
                name: "limit",
                in: "query",
                description: "Generated limit description",
                schema: { anyOf: [{ type: "string" }, { type: "null" }] },
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
      { name: "cursor", in: "query", schema: { type: "string" } },
      {
        name: "mailboxId",
        in: "query",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
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

    expect(responseSchema).toEqual({ $ref: "#/components/schemas/MessageList" });
    expect(schemaAt(document, ["components", "schemas", "MessageList"])).not.toHaveProperty(
      "$defs",
    );
    expect(
      schemaAt(document, ["components", "schemas", "MessageList", "properties", "data"]),
    ).toEqual({
      $ref: "#/components/schemas/Message",
    });
    expect(schemaAt(document, ["components", "schemas", "Message"])).toEqual({
      type: "object",
    });
    expect(schemaAt(document, ["components", "schemas", "Label"])).toEqual({ type: "string" });
  });

  it("adds semantic operation metadata for SDK generation", () => {
    const document = normalizeOpenApiDocument({
      paths: {
        "/v1/messages": {
          get: {
            operationId: "getV1Messages",
          },
        },
      },
    });

    expect(document.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "messages" }),
        expect.objectContaining({ name: "mailboxes" }),
      ]),
    );
    expect(document["x-speakeasy-retries"]).toMatchObject({
      strategy: "backoff",
      statusCodes: ["5XX", "429"],
      retryConnectionErrors: true,
    });
    expect(schemaAt(document, ["paths", "/v1/messages", "get"])).toMatchObject({
      operationId: "messages_list",
      tags: ["messages"],
      "x-speakeasy-group": "messages",
      "x-speakeasy-name-override": "list",
      "x-speakeasy-pagination": {
        type: "cursor",
        outputs: {
          results: "$.data",
          nextCursor: "$.nextCursor",
        },
      },
    });
  });

  it("promotes operation request and response schemas into named components", () => {
    const document = normalizeOpenApiDocument({
      paths: {
        "/v1/replays": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      mailboxId: { type: "string", allOf: [{ minLength: 1 }] },
                    },
                  },
                },
              },
            },
            responses: {
              "201": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        status: {
                          type: "string",
                          enum: ["queued", "running"],
                        },
                      },
                    },
                  },
                },
              },
              "409": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        code: { type: "string" },
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

    expect(
      schemaAt(document, [
        "paths",
        "/v1/replays",
        "post",
        "requestBody",
        "content",
        "application/json",
        "schema",
      ]),
    ).toEqual({ $ref: "#/components/schemas/CreateReplayRequest" });
    expect(
      schemaAt(document, [
        "paths",
        "/v1/replays",
        "post",
        "responses",
        "201",
        "content",
        "application/json",
        "schema",
      ]),
    ).toEqual({ $ref: "#/components/schemas/Replay" });
    expect(
      schemaAt(document, [
        "paths",
        "/v1/replays",
        "post",
        "responses",
        "409",
        "content",
        "application/json",
        "schema",
      ]),
    ).toEqual({ $ref: "#/components/schemas/ProblemDetails" });
    expect(
      schemaAt(document, [
        "components",
        "schemas",
        "CreateReplayRequest",
        "properties",
        "mailboxId",
      ]),
    ).toEqual({ type: "string", minLength: 1 });
    expect(schemaAt(document, ["components", "schemas", "Replay", "properties", "status"])).toEqual(
      {
        type: "string",
        enum: ["queued", "running"],
        "x-speakeasy-unknown-values": "allow",
      },
    );
  });

  it("promotes repeated nested schemas into reusable components", () => {
    const errorDetail = {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        occurredAt: { type: "string", format: "date-time" },
        retryable: { type: "boolean" },
      },
      required: ["code", "message", "occurredAt", "retryable"],
      additionalProperties: false,
    };
    const deliveryState = {
      type: "string",
      enum: ["healthy", "degraded", "failing"],
    };
    const syncRun = {
      type: "object",
      properties: {
        syncRunId: { type: "string" },
        status: {
          type: "string",
          enum: ["running", "completed"],
        },
      },
      required: ["syncRunId", "status"],
      additionalProperties: false,
    };
    const document = normalizeOpenApiDocument({
      components: {
        schemas: {
          WebhookEndpoint: {
            type: "object",
            properties: {
              lastDeliveryError: { anyOf: [errorDetail, { type: "null" }] },
              deliveryState,
            },
          },
          Mailbox: {
            type: "object",
            properties: {
              lastError: { anyOf: [errorDetail, { type: "null" }] },
            },
          },
          SyncRunList: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: syncRun,
              },
            },
          },
          MailboxObservability: {
            type: "object",
            properties: {
              webhookDeliveries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    lastDeliveryError: { anyOf: [errorDetail, { type: "null" }] },
                    deliveryState,
                  },
                },
              },
              latestSyncRun: { anyOf: [syncRun, { type: "null" }] },
            },
          },
        },
      },
    });

    expect(
      schemaAt(document, [
        "components",
        "schemas",
        "WebhookEndpoint",
        "properties",
        "lastDeliveryError",
        "anyOf",
        0,
      ]),
    ).toEqual({ $ref: "#/components/schemas/ErrorDetail" });
    expect(
      schemaAt(document, [
        "components",
        "schemas",
        "Mailbox",
        "properties",
        "lastError",
        "anyOf",
        0,
      ]),
    ).toEqual({
      $ref: "#/components/schemas/ErrorDetail",
    });
    expect(
      schemaAt(document, [
        "components",
        "schemas",
        "WebhookEndpoint",
        "properties",
        "deliveryState",
      ]),
    ).toEqual({
      $ref: "#/components/schemas/DeliveryState",
    });
    expect(
      schemaAt(document, ["components", "schemas", "SyncRunList", "properties", "data", "items"]),
    ).toEqual({
      $ref: "#/components/schemas/SyncRun",
    });
    expect(
      schemaAt(document, [
        "components",
        "schemas",
        "MailboxObservability",
        "properties",
        "latestSyncRun",
        "anyOf",
        0,
      ]),
    ).toEqual({ $ref: "#/components/schemas/SyncRun" });
    expect(
      schemaAt(document, ["components", "schemas", "SyncRun", "properties", "status"]),
    ).toEqual({
      $ref: "#/components/schemas/SyncRunStatus",
    });
  });
});
