import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { generateSpecs } from "hono-openapi";

import type { ApiServerRuntime } from "./http/handlers.js";
import { normalizeOpenApiDocument } from "./http/openapi-normalization.js";
import { createApp, mailmonOpenApiOptions } from "./server.js";

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
