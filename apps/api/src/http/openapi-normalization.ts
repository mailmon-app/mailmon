type JsonObject = Record<string, unknown>;

const isJsonObject = (value: unknown): value is JsonObject => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

        if (parameter.name === "limit" && isJsonObject(parameter.schema)) {
          parameter.schema.type = "integer";
          parameter.schema.minimum = 1;
          parameter.schema.maximum = 100;
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

export const normalizeOpenApiDocument = (specs: JsonObject) => {
  const components = isJsonObject(specs.components) ? specs.components : {};
  const schemas = isJsonObject(components.schemas) ? components.schemas : {};

  preferCamelCaseRequestSchemas(specs);
  preferCamelCaseQueryParameters(specs);
  liftJsonSchemaDefsToComponents(specs, schemas);

  components.schemas = schemas;
  specs.components = components;

  return specs;
};
