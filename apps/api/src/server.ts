import { MailboxCatalog, getMailboxOrFail } from "@mailmon/core";
import { Effect } from "effect";
import { Hono } from "hono";

export interface ApiServerRuntime {
  readonly runPromise: <A, E>(
    effect: Effect.Effect<A, E, MailboxCatalog>,
    options?: {
      readonly signal?: AbortSignal;
    },
  ) => Promise<A>;
}

export const createApp = (runtime: ApiServerRuntime) => {
  const app = new Hono();

  app.get("/health", (context) => {
    return context.json({ status: "ok" });
  });

  app.get("/v1/mailboxes/:mailboxId", async (context) => {
    const result = await runtime.runPromise(
      getMailboxOrFail(context.req.param("mailboxId")).pipe(
        Effect.match({
          onFailure: (problem) => ({ _tag: "failure" as const, problem }),
          onSuccess: (mailbox) => ({ _tag: "success" as const, mailbox }),
        }),
      ),
    );

    if (result._tag === "failure") {
      return new Response(JSON.stringify(result.problem), {
        status: result.problem.status,
        headers: {
          "content-type": "application/json",
        },
      });
    }

    return context.json(result.mailbox);
  });

  return app;
};
