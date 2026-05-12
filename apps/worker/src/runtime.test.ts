import { createServer, type Server } from "node:http";

import {
  type PreparedWebhookDelivery,
  WebhookDeliveryScheduler,
  WebhookDeliverySender,
} from "@mailmon/core";
import { Effect, ManagedRuntime } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createInProcessWebhookDeliverySchedulerLayer,
  createWebhookDeliverySenderLayer,
} from "./runtime.js";

const activeServers: Array<Server> = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    activeServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }),
    ),
  );
});

describe("createInProcessWebhookDeliverySchedulerLayer", () => {
  it("does not dispatch before the durable notBefore timestamp when timers fire early", async () => {
    vi.useFakeTimers();

    const scheduledAtMs = Date.parse("2026-04-25T00:00:00.000Z");
    const notBefore = new Date(scheduledAtMs + 100).toISOString();
    let nowMs = scheduledAtMs;
    const dispatched: Array<{
      readonly deliveryId: string;
      readonly notBefore: string;
    }> = [];
    const runtime = ManagedRuntime.make(
      createInProcessWebhookDeliverySchedulerLayer({
        dispatch: (request) => {
          dispatched.push(request);

          return Promise.resolve({
            deliveryId: request.deliveryId,
            status: "delivered",
            attemptCount: 1,
            nextAttemptAt: null,
          });
        },
        now: () => nowMs,
      }),
    );

    try {
      await runtime.runPromise(
        Effect.gen(function* () {
          const scheduler = yield* WebhookDeliveryScheduler;

          yield* scheduler.scheduleWebhookDelivery({
            deliveryId: "del_early_timer",
            notBefore,
          });
        }),
      );

      nowMs = scheduledAtMs + 99;
      await vi.advanceTimersByTimeAsync(100);

      expect(dispatched).toEqual([]);

      nowMs = scheduledAtMs + 100;
      await vi.advanceTimersByTimeAsync(1);

      expect(dispatched).toEqual([
        {
          deliveryId: "del_early_timer",
          notBefore,
        },
      ]);
    } finally {
      await runtime.dispose();
    }
  });
});

const startCaptureServer = async (
  handler: (
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
  ) => void,
) => {
  const server = createServer(handler);

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  activeServers.push(server);

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Expected the test server to bind to an ephemeral port.");
  }

  return `http://127.0.0.1:${address.port}`;
};

const deliveryFixture = (url: string): PreparedWebhookDelivery => ({
  deliveryId: "del_demo",
  mailboxEventId: "evt_demo",
  webhookEndpointId: "whe_demo",
  attemptCount: 1,
  processingStartedAt: "2026-03-24T00:00:05.000Z",
  url,
  signingSecret: "whsec_demo",
  event: {
    id: "evt_demo",
    type: "message.created",
    occurredAt: "2026-03-24T00:00:00.000Z",
    workspaceId: "ws_123",
    tenantExternalId: "tenant_123",
    mailboxId: "mbx_demo",
    schemaVersion: 1,
    data: {
      messageId: "msg_demo",
      threadId: "thr_demo",
      providerMessageId: "gmail_msg_demo",
      providerThreadId: "gmail_thr_demo",
      subject: "Demo thread",
      snippet: "Mailbox message fixture",
      receivedAt: "2026-03-24T00:00:00.000Z",
      labelIds: ["INBOX"],
    },
  },
});

describe("createWebhookDeliverySenderLayer", () => {
  it("signs webhook deliveries with the endpoint secret", async () => {
    const requests: Array<{
      readonly body: string;
      readonly headers: import("node:http").IncomingHttpHeaders;
    }> = [];
    const baseUrl = await startCaptureServer((request, response) => {
      void (async () => {
        const chunks: Array<Buffer> = [];

        for await (const chunk of request) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }

        requests.push({
          body: Buffer.concat(chunks).toString("utf8"),
          headers: request.headers,
        });

        response.writeHead(202, {
          "content-type": "application/json",
        });
        response.end("{}");
      })();
    });
    const attemptedAt = "2026-03-24T00:00:05.000Z";
    const delivery = deliveryFixture(baseUrl);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sender = yield* WebhookDeliverySender;

        return yield* sender.send(delivery, attemptedAt);
      }).pipe(Effect.provide(createWebhookDeliverySenderLayer())),
    );

    const request = requests[0];
    const expectedBody = JSON.stringify(delivery.event);

    expect(result).toEqual({
      statusCode: 202,
    });
    expect(request.body).toBe(expectedBody);
    expect(request.headers["x-mailmon-delivery-id"]).toBe(delivery.deliveryId);
    expect(request.headers["x-mailmon-event-id"]).toBe(delivery.event.id);
    expect(request.headers["x-mailmon-attempt"]).toBe(String(delivery.attemptCount));
    expect(request.headers["x-mailmon-signature"]).toBe(
      "t=1774310405,v1=404015d85ed172558a1f9316898c7d51e67b73c05d4402dc235031a35558026b",
    );
  });

  it("classifies timed out deliveries as retryable failures", async () => {
    const baseUrl = await startCaptureServer((_request, response) => {
      globalThis.setTimeout(() => {
        response.writeHead(204);
        response.end();
      }, 50);
    });
    const delivery = deliveryFixture(baseUrl);

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const sender = yield* WebhookDeliverySender;

        return yield* sender.send(delivery, "2026-03-24T00:00:05.000Z").pipe(Effect.flip);
      }).pipe(
        Effect.provide(
          createWebhookDeliverySenderLayer({
            timeoutMs: 10,
          }),
        ),
      ),
    );

    expect(failure).toEqual({
      code: "webhook_delivery_timeout",
      message: "Webhook delivery timed out before the endpoint responded.",
      retryable: true,
    });
  });
});
