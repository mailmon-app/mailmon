import { Hono } from "hono";

export const createApp = () => {
  const app = new Hono();

  app.get("/health", (context) => {
    return context.json({ status: "ok" });
  });

  return app;
};
