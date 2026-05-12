import { describe, expect, it } from "@effect/vitest";

import type { PreparedWebhookDelivery } from "./contracts.js";
import { buildWebhookDeliveryHttpRequest } from "./webhook-delivery-request.js";

describe("buildWebhookDeliveryHttpRequest", () => {
  it("builds the canonical JSON body, Mailmon headers, and webhook signature", () => {
    const delivery: PreparedWebhookDelivery = {
      deliveryId: "del_demo",
      mailboxEventId: "evt_demo",
      webhookEndpointId: "whe_demo",
      attemptCount: 1,
      processingStartedAt: "2026-03-24T00:00:05.000Z",
      url: "https://example.test/webhooks/mailmon",
      signingSecret: "whsec_demo",
      event: {
        id: "evt_demo",
        type: "message.created",
        schemaVersion: 1,
        occurredAt: "2026-03-24T00:00:00.000Z",
        workspaceId: "ws_123",
        tenantExternalId: "tenant_123",
        mailboxId: "mbx_demo",
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
    };

    const request = buildWebhookDeliveryHttpRequest({
      attemptedAt: "2026-03-24T00:00:05.000Z",
      delivery,
      userAgent: "mailmon-test/1.0",
    });

    expect(request.body).toBe(
      '{"id":"evt_demo","type":"message.created","schemaVersion":1,"occurredAt":"2026-03-24T00:00:00.000Z","workspaceId":"ws_123","tenantExternalId":"tenant_123","mailboxId":"mbx_demo","data":{"messageId":"msg_demo","threadId":"thr_demo","providerMessageId":"gmail_msg_demo","providerThreadId":"gmail_thr_demo","subject":"Demo thread","snippet":"Mailbox message fixture","receivedAt":"2026-03-24T00:00:00.000Z","labelIds":["INBOX"]}}',
    );
    expect(request.headers).toEqual({
      "content-type": "application/json",
      "user-agent": "mailmon-test/1.0",
      "x-mailmon-attempt": "1",
      "x-mailmon-delivery-id": "del_demo",
      "x-mailmon-event-id": "evt_demo",
      "x-mailmon-signature":
        "t=1774310405,v1=7d8ca193a0cb8c4b1e5501e13dca952b981f8354e21ded4dfdd562624c051fbc",
    });
  });
});
