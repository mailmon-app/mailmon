type JsonObject = Record<string, unknown>;

type OperationMetadata = Readonly<{
  operationId: string;
  tag: string;
  speakeasyGroup: string;
  speakeasyName: string;
  requestSchema?: string;
  successResponseSchema?: string;
  paginated?: boolean;
}>;

const operationMetadata: Readonly<Record<string, Readonly<Record<string, OperationMetadata>>>> = {
  "/v1/mailboxes/connect-sessions": {
    post: {
      operationId: "mailboxes_create_connect_session",
      tag: "mailboxes",
      speakeasyGroup: "mailboxes",
      speakeasyName: "createConnectSession",
      requestSchema: "CreateConnectSessionRequest",
      successResponseSchema: "ConnectSession",
    },
  },
  "/v1/webhook-endpoints": {
    post: {
      operationId: "webhook_endpoints_create",
      tag: "webhook-endpoints",
      speakeasyGroup: "webhookEndpoints",
      speakeasyName: "create",
      requestSchema: "CreateWebhookEndpointRequest",
      successResponseSchema: "WebhookEndpoint",
    },
  },
  "/v1/webhook-endpoints/{endpointId}/subscriptions": {
    post: {
      operationId: "webhook_endpoints_create_subscription",
      tag: "webhook-endpoints",
      speakeasyGroup: "webhookEndpoints",
      speakeasyName: "createSubscription",
      requestSchema: "CreateWebhookEndpointSubscriptionRequest",
      successResponseSchema: "WebhookEndpointSubscriptionList",
    },
  },
  "/v1/mailboxes/{mailboxId}": {
    get: {
      operationId: "mailboxes_get",
      tag: "mailboxes",
      speakeasyGroup: "mailboxes",
      speakeasyName: "get",
      successResponseSchema: "Mailbox",
    },
  },
  "/v1/mailboxes/{mailboxId}/sync-runs": {
    get: {
      operationId: "mailboxes_list_sync_runs",
      tag: "mailboxes",
      speakeasyGroup: "mailboxes",
      speakeasyName: "listSyncRuns",
      successResponseSchema: "SyncRunList",
      paginated: true,
    },
  },
  "/v1/mailboxes/{mailboxId}/observability": {
    get: {
      operationId: "mailboxes_get_observability",
      tag: "mailboxes",
      speakeasyGroup: "mailboxes",
      speakeasyName: "getObservability",
      successResponseSchema: "MailboxObservability",
    },
  },
  "/v1/replays": {
    post: {
      operationId: "replays_create",
      tag: "replays",
      speakeasyGroup: "replays",
      speakeasyName: "create",
      requestSchema: "CreateReplayRequest",
      successResponseSchema: "Replay",
    },
  },
  "/v1/replays/{replayId}": {
    get: {
      operationId: "replays_get",
      tag: "replays",
      speakeasyGroup: "replays",
      speakeasyName: "get",
      successResponseSchema: "Replay",
    },
  },
  "/v1/messages": {
    get: {
      operationId: "messages_list",
      tag: "messages",
      speakeasyGroup: "messages",
      speakeasyName: "list",
      successResponseSchema: "MessageList",
      paginated: true,
    },
  },
  "/v1/messages/{messageId}": {
    get: {
      operationId: "messages_get",
      tag: "messages",
      speakeasyGroup: "messages",
      speakeasyName: "get",
      successResponseSchema: "Message",
    },
  },
  "/v1/threads": {
    get: {
      operationId: "threads_list",
      tag: "threads",
      speakeasyGroup: "threads",
      speakeasyName: "list",
      successResponseSchema: "ThreadList",
      paginated: true,
    },
  },
  "/v1/threads/{threadId}": {
    get: {
      operationId: "threads_get",
      tag: "threads",
      speakeasyGroup: "threads",
      speakeasyName: "get",
      successResponseSchema: "Thread",
    },
  },
};

const globalTags = [
  {
    name: "mailboxes",
    description: "Mailbox connection, inspection, and sync observability operations.",
  },
  {
    name: "webhook-endpoints",
    description: "Webhook endpoint and mailbox subscription operations.",
  },
  {
    name: "replays",
    description: "Mailbox event replay operations.",
  },
  {
    name: "messages",
    description: "Mailbox message read operations.",
  },
  {
    name: "threads",
    description: "Mailbox thread read operations.",
  },
] as const;

const isJsonObject = (value: unknown): value is JsonObject => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const jsonEquals = (left: unknown, right: unknown) => {
  return JSON.stringify(left) === JSON.stringify(right);
};

const liftJsonSchemaDefsToComponents = (value: unknown, components: JsonObject) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      liftJsonSchemaDefsToComponents(item, components);
    }

    return;
  }

  if (!isJsonObject(value)) {
    return;
  }

  const defs = value.$defs;

  if (isJsonObject(defs)) {
    for (const [name, schema] of Object.entries(defs)) {
      components[name] ??= schema;
      liftJsonSchemaDefsToComponents(schema, components);
    }

    delete value.$defs;
  }

  for (const child of Object.values(value)) {
    liftJsonSchemaDefsToComponents(child, components);
  }
};

const rewriteJsonSchemaDefsRefs = (value: unknown) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      rewriteJsonSchemaDefsRefs(item);
    }

    return;
  }

  if (!isJsonObject(value)) {
    return;
  }

  if (typeof value.$ref === "string" && value.$ref.startsWith("#/$defs/")) {
    value.$ref = value.$ref.replace("#/$defs/", "#/components/schemas/");
  }

  for (const child of Object.values(value)) {
    rewriteJsonSchemaDefsRefs(child);
  }
};

const removeUndefinedProperties = (value: unknown) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      removeUndefinedProperties(item);
    }

    return;
  }

  if (!isJsonObject(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) {
      delete value[key];
      continue;
    }

    removeUndefinedProperties(child);
  }
};

const mergeSingleConstraintAllOf = (schema: JsonObject) => {
  if (!Array.isArray(schema.allOf)) {
    return;
  }

  const directConstraints = schema.allOf.filter(isJsonObject);

  if (
    directConstraints.length !== schema.allOf.length ||
    directConstraints.some((constraint) => "$ref" in constraint)
  ) {
    return;
  }

  for (const constraint of directConstraints) {
    for (const [key, value] of Object.entries(constraint)) {
      schema[key] ??= value;
    }
  }

  delete schema.allOf;
};

const simplifyAnyOf = (schema: JsonObject) => {
  if (!Array.isArray(schema.anyOf)) {
    return;
  }

  const flattened = schema.anyOf.flatMap((option) => {
    return isJsonObject(option) && Array.isArray(option.anyOf) ? option.anyOf : [option];
  });
  const unique = flattened.filter((option, index) => {
    return flattened.findIndex((candidate) => jsonEquals(candidate, option)) === index;
  });

  if (unique.length === 1 && Object.keys(schema).length === 1 && isJsonObject(unique[0])) {
    delete schema.anyOf;
    Object.assign(schema, unique[0]);
    return;
  }

  schema.anyOf = unique;
};

const removeRedundantPrefixItems = (schema: JsonObject) => {
  if (
    Array.isArray(schema.prefixItems) &&
    schema.prefixItems.length === 1 &&
    jsonEquals(schema.prefixItems[0], schema.items)
  ) {
    delete schema.prefixItems;
  }
};

const simplifyJsonSchemas = (value: unknown) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      simplifyJsonSchemas(item);
    }

    return;
  }

  if (!isJsonObject(value)) {
    return;
  }

  for (const child of Object.values(value)) {
    simplifyJsonSchemas(child);
  }

  mergeSingleConstraintAllOf(value);
  simplifyAnyOf(value);
  removeRedundantPrefixItems(value);
};

const hasOnlyCamelCaseProperties = (schema: JsonObject) => {
  if (!Array.isArray(schema.required)) {
    return false;
  }

  return schema.required.every((property) => {
    return typeof property === "string" && !property.includes("_");
  });
};

const preferCamelCaseRequestSchemas = (value: unknown) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      preferCamelCaseRequestSchemas(item);
    }

    return;
  }

  if (!isJsonObject(value)) {
    return;
  }

  if (Array.isArray(value.anyOf)) {
    const includesNullSchema = value.anyOf.some((schema) => {
      return isJsonObject(schema) && schema.type === "null";
    });
    const camelCaseSchema = value.anyOf.find((schema) => {
      return isJsonObject(schema) && hasOnlyCamelCaseProperties(schema);
    });

    if (!includesNullSchema && isJsonObject(camelCaseSchema)) {
      delete value.anyOf;
      Object.assign(value, camelCaseSchema);
    }
  }

  for (const child of Object.values(value)) {
    preferCamelCaseRequestSchemas(child);
  }
};

const preferCamelCaseQueryParameters = (specs: JsonObject) => {
  const paths = isJsonObject(specs.paths) ? specs.paths : {};

  const removeNullFromQuerySchema = (schema: JsonObject) => {
    if (!Array.isArray(schema.anyOf)) {
      return;
    }

    const nonNullSchemas = schema.anyOf.filter((option) => {
      return !isJsonObject(option) || option.type !== "null";
    });

    if (nonNullSchemas.length === 1 && isJsonObject(nonNullSchemas[0])) {
      for (const key of Object.keys(schema)) {
        delete schema[key];
      }

      Object.assign(schema, nonNullSchemas[0]);
      return;
    }

    schema.anyOf = nonNullSchemas;
  };

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isJsonObject(pathItem)) {
      continue;
    }

    for (const operation of Object.values(pathItem)) {
      if (!isJsonObject(operation) || !Array.isArray(operation.parameters)) {
        continue;
      }

      const parameters = operation.parameters.filter((parameter) => {
        return !isJsonObject(parameter) || parameter.name !== "mailbox_id";
      });

      for (const parameter of parameters) {
        if (!isJsonObject(parameter)) {
          continue;
        }

        if (isJsonObject(parameter.schema)) {
          removeNullFromQuerySchema(parameter.schema);
        }

        if (parameter.name === "limit" && isJsonObject(parameter.schema)) {
          parameter.schema = { type: "integer", minimum: 1, maximum: 100 };
          delete parameter.description;
        }

        if ((path === "/v1/messages" || path === "/v1/threads") && parameter.name === "mailboxId") {
          parameter.required = true;
        }
      }

      operation.parameters = parameters;
    }
  }
};

const enrichOperations = (specs: JsonObject) => {
  const paths = isJsonObject(specs.paths) ? specs.paths : {};

  for (const [path, methods] of Object.entries(operationMetadata)) {
    const pathItem = paths[path];

    if (!isJsonObject(pathItem)) {
      continue;
    }

    for (const [method, metadata] of Object.entries(methods)) {
      const operation = pathItem[method];

      if (!isJsonObject(operation)) {
        continue;
      }

      operation.operationId = metadata.operationId;
      operation.tags = [metadata.tag];
      operation["x-speakeasy-group"] = metadata.speakeasyGroup;
      operation["x-speakeasy-name-override"] = metadata.speakeasyName;

      if (metadata.paginated === true) {
        operation["x-speakeasy-pagination"] = {
          type: "cursor",
          inputs: [
            {
              name: "cursor",
              in: "parameters",
              type: "cursor",
            },
          ],
          outputs: {
            results: "$.data",
            nextCursor: "$.nextCursor",
          },
        };
      }
    }
  }
};

const enrichRootMetadata = (specs: JsonObject) => {
  specs.tags = globalTags;
  specs["x-speakeasy-retries"] = {
    strategy: "backoff",
    backoff: {
      initialInterval: 500,
      maxInterval: 60000,
      maxElapsedTime: 3600000,
      exponent: 1.5,
    },
    statusCodes: ["5XX", "429"],
    retryConnectionErrors: true,
  };
};

const jsonSchemaContent = (container: unknown) => {
  if (!isJsonObject(container)) {
    return undefined;
  }

  const content = container.content;
  if (!isJsonObject(content)) {
    return undefined;
  }

  const jsonContent = content["application/json"];
  if (!isJsonObject(jsonContent)) {
    return undefined;
  }

  return jsonContent;
};

const promoteSchema = (jsonContent: JsonObject | undefined, schemas: JsonObject, name: string) => {
  if (jsonContent === undefined || !isJsonObject(jsonContent.schema)) {
    return;
  }

  schemas[name] ??= jsonContent.schema;
  jsonContent.schema = { $ref: `#/components/schemas/${name}` };
};

const componentizeOperationSchemas = (specs: JsonObject, schemas: JsonObject) => {
  const paths = isJsonObject(specs.paths) ? specs.paths : {};

  for (const [path, methods] of Object.entries(operationMetadata)) {
    const pathItem = paths[path];

    if (!isJsonObject(pathItem)) {
      continue;
    }

    for (const [method, metadata] of Object.entries(methods)) {
      const operation = pathItem[method];

      if (!isJsonObject(operation)) {
        continue;
      }

      if (metadata.requestSchema !== undefined) {
        promoteSchema(jsonSchemaContent(operation.requestBody), schemas, metadata.requestSchema);
      }

      if (metadata.successResponseSchema !== undefined && isJsonObject(operation.responses)) {
        promoteSchema(
          jsonSchemaContent(operation.responses["200"] ?? operation.responses["201"]),
          schemas,
          metadata.successResponseSchema,
        );
      }

      if (isJsonObject(operation.responses)) {
        for (const [status, response] of Object.entries(operation.responses)) {
          if (status.startsWith("4") || status.startsWith("5")) {
            promoteSchema(jsonSchemaContent(response), schemas, "ProblemDetails");
          }
        }
      }
    }
  }
};

const allowUnknownEnumValues = (value: unknown) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      allowUnknownEnumValues(item);
    }

    return;
  }

  if (!isJsonObject(value)) {
    return;
  }

  if (Array.isArray(value.enum) && value.enum.length > 1) {
    value["x-speakeasy-unknown-values"] = "allow";
  }

  for (const child of Object.values(value)) {
    allowUnknownEnumValues(child);
  }
};

const schemaAtPath = (
  schemas: JsonObject,
  path: ReadonlyArray<string | number>,
): JsonObject | undefined => {
  let value: unknown = schemas;

  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(value)) {
        return undefined;
      }

      value = value[segment];
      continue;
    }

    if (!isJsonObject(value)) {
      return undefined;
    }

    value = value[segment];
  }

  return isJsonObject(value) ? value : undefined;
};

const cloneJsonObject = (value: JsonObject) => {
  return structuredClone(value);
};

const reusableSchemaSources = [
  {
    name: "ErrorDetail",
    path: ["WebhookEndpoint", "properties", "lastDeliveryError", "anyOf", 0],
  },
  {
    name: "DeliveryState",
    path: ["WebhookEndpoint", "properties", "deliveryState"],
  },
  {
    name: "WebhookEventType",
    path: ["CreateWebhookEndpointSubscriptionRequest", "properties", "eventTypes", "items"],
  },
  {
    name: "MailboxStatus",
    path: ["Mailbox", "properties", "status"],
  },
  {
    name: "SyncState",
    path: ["Mailbox", "properties", "syncState"],
  },
  {
    name: "WatchState",
    path: ["Mailbox", "properties", "watchState"],
  },
  {
    name: "SyncRun",
    path: ["SyncRunList", "properties", "data", "items"],
  },
  {
    name: "SyncRunStatus",
    path: ["SyncRun", "properties", "status"],
  },
] as const;

const replaceInlineSchemaWithRef = (
  value: unknown,
  schemaName: string,
  targetSchema: JsonObject,
) => {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      if (isJsonObject(item) && jsonEquals(item, targetSchema)) {
        value[index] = { $ref: `#/components/schemas/${schemaName}` };
        continue;
      }

      replaceInlineSchemaWithRef(item, schemaName, targetSchema);
    }

    return;
  }

  if (!isJsonObject(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === schemaName) {
      continue;
    }

    if (isJsonObject(child) && jsonEquals(child, targetSchema)) {
      value[key] = { $ref: `#/components/schemas/${schemaName}` };
      continue;
    }

    replaceInlineSchemaWithRef(child, schemaName, targetSchema);
  }
};

const promoteReusableSchemas = (specs: JsonObject, schemas: JsonObject) => {
  for (const source of reusableSchemaSources) {
    const schema = schemas[source.name] ?? schemaAtPath(schemas, source.path);

    if (!isJsonObject(schema)) {
      continue;
    }

    schemas[source.name] = cloneJsonObject(schema);
    replaceInlineSchemaWithRef(specs, source.name, schema);
  }
};

export const normalizeOpenApiDocument = (specs: JsonObject) => {
  const components = isJsonObject(specs.components) ? specs.components : {};
  const schemas = isJsonObject(components.schemas) ? components.schemas : {};

  enrichRootMetadata(specs);
  enrichOperations(specs);
  preferCamelCaseRequestSchemas(specs);
  preferCamelCaseQueryParameters(specs);
  componentizeOperationSchemas(specs, schemas);
  components.schemas = schemas;
  specs.components = components;
  liftJsonSchemaDefsToComponents(specs, schemas);
  rewriteJsonSchemaDefsRefs(specs);
  simplifyJsonSchemas(specs);
  promoteReusableSchemas(specs, schemas);
  allowUnknownEnumValues(schemas);
  removeUndefinedProperties(specs);

  components.schemas = schemas;
  specs.components = components;

  return specs;
};
