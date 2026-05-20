import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { Mailmon, webhooks } from "../esm/index.js";
import {
  constructEvent,
  MailmonWebhookSignatureError,
  verifySignature,
} from "../esm/webhooks.js";

const secret = "whsec_test";
const timestamp = "1700000000";
const body = JSON.stringify({
  id: "evt_123",
  type: "message.created",
});
const signature = createHmac("sha256", secret)
  .update(`${timestamp}.${body}`)
  .digest("hex");
const header = `t=${timestamp},v1=${signature}`;
const now = Number(timestamp) * 1000;

test("verifySignature returns true for a valid Mailmon webhook signature", () => {
  assert.equal(verifySignature(body, header, secret, { now }), true);
  assert.equal(webhooks.verifySignature(body, header, secret, { now }), true);
  assert.equal(
    new Mailmon({ bearerAuth: "test" }).webhooks.verifySignature(
      body,
      header,
      secret,
      { now },
    ),
    true,
  );
});

test("constructEvent verifies and parses the raw webhook body", () => {
  const event = constructEvent(body, header, secret, { now });

  assert.deepEqual(event, {
    id: "evt_123",
    type: "message.created",
  });
});

test("verifySignature accepts byte payloads", () => {
  const payload = new TextEncoder().encode(body);

  assert.equal(verifySignature(payload, header, secret, { now }), true);
});

test("verifySignature rejects invalid signatures", () => {
  assert.throws(
    () => verifySignature(body, `t=${timestamp},v1=deadbeef`, secret, { now }),
    MailmonWebhookSignatureError,
  );
});

test("verifySignature rejects stale timestamps", () => {
  assert.throws(
    () => verifySignature(body, header, secret, { now: now + 301_000 }),
    /outside the tolerance window/,
  );
});
