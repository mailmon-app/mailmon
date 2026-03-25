import { serve } from "@hono/node-server";
import { loadApiEnv } from "@mailmon/config";

import { createApiRuntime } from "./runtime.js";
import { createApp } from "./server.js";

const env = loadApiEnv();
const runtime = createApiRuntime(env);
const app = createApp(runtime);

const shutdown = () => {
  void runtime.dispose();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    console.log(`api listening on http://localhost:${info.port}`);
  },
);
