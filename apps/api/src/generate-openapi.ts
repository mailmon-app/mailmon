import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { generateSpecs } from "hono-openapi";

import type { ApiServerRuntime } from "./http/handlers.js";
import { createApp, mailmonOpenApiOptions } from "./server.js";

type JsonObject = Record<string, unknown>;

const defaultOutputPath = fileURLToPath(
  new URL("../../../apps/docs/api-reference/openapi.json", import.meta.url),
);

const rejectOpenApiRuntimeExecution: ApiServerRuntime["runPromise"] = () => {
  return Promise.reject(
    new Error("The OpenAPI generator should not execute Mailmon request handlers."),
  );
};

const openApiOnlyRuntime: ApiServerRuntime = {
  runPromise: rejectOpenApiRuntimeExecution,
};

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

export const generateOpenApiDocument = async () => {
  const app = createApp(openApiOnlyRuntime);
  const specs = await generateSpecs(app, mailmonOpenApiOptions);

  return normalizeOpenApiDocument(specs);
};

const main = async () => {
  const outputPath = process.argv[2] ?? defaultOutputPath;
  const normalizedSpecs = await generateOpenApiDocument();

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(normalizedSpecs, null, 2)}\n`);
  console.log(`Wrote OpenAPI spec to ${outputPath}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
