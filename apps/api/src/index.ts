import { serve } from "@hono/node-server";
import { loadApiEnv } from "@mailmon/config";

import { createApp } from "./server.js";

const env = loadApiEnv();
const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    console.log(`api listening on http://localhost:${info.port}`);
  },
);
