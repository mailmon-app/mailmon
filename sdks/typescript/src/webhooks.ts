import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 300;

export type WebhookPayload = string | Uint8Array | ArrayBuffer;

export type WebhookSignatureOptions = {
  /**
   * Maximum age of the signature timestamp in seconds.
   *
   * @default 300
   */
  toleranceSeconds?: number;
  /**
   * Override the current time for deterministic tests. Numbers are interpreted
   * as milliseconds since the Unix epoch, matching Date.now().
   */
  now?: Date | number;
};

export type WebhookEventType =
  | "message.created"
  | "message.updated"
  | "thread.updated";

export type MailboxMessageEventData = {
  readonly messageId: string;
  readonly threadId: string;
  readonly providerMessageId: string;
  readonly providerThreadId: string;
  readonly subject: string;
  readonly snippet: string;
  readonly receivedAt: string;
  readonly labelIds: ReadonlyArray<string>;
};

export type MailboxThreadEventData = {
  readonly threadId: string;
  readonly providerThreadId: string;
  readonly subject: string;
  readonly lastMessageAt: string;
};

export type WebhookEventEnvelopeBase<
  TType extends WebhookEventType,
  TData extends MailboxMessageEventData | MailboxThreadEventData,
> = {
  readonly id: string;
  readonly type: TType;
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly tenantExternalId: string;
  readonly mailboxId: string;
  readonly data: TData;
};

export type MessageCreatedWebhookEvent = WebhookEventEnvelopeBase<
  "message.created",
  MailboxMessageEventData
>;

export type MessageUpdatedWebhookEvent = WebhookEventEnvelopeBase<
  "message.updated",
  MailboxMessageEventData
>;

export type ThreadUpdatedWebhookEvent = WebhookEventEnvelopeBase<
  "thread.updated",
  MailboxThreadEventData
>;

export type WebhookEventEnvelope =
  | MessageCreatedWebhookEvent
  | MessageUpdatedWebhookEvent
  | ThreadUpdatedWebhookEvent;

export class MailmonWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailmonWebhookSignatureError";
  }
}

function toUtf8Body(payload: WebhookPayload): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }

  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    ).toString("utf8");
  }

  throw new MailmonWebhookSignatureError(
    "Webhook payload must be the raw request body as a string, Buffer, Uint8Array, or ArrayBuffer.",
  );
}

function parseSignatureHeader(signatureHeader: string | undefined): {
  timestamp: string;
  signature: string;
} {
  if (typeof signatureHeader !== "string" || signatureHeader.length === 0) {
    throw new MailmonWebhookSignatureError(
      "Missing x-mailmon-signature header.",
    );
  }

  const parts = new Map<string, string>();
  for (const item of signatureHeader.split(",")) {
    const [key, ...valueParts] = item.split("=");
    if (key !== undefined && valueParts.length > 0) {
      parts.set(key.trim(), valueParts.join("=").trim());
    }
  }

  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (timestamp === undefined || signature === undefined) {
    throw new MailmonWebhookSignatureError(
      "Malformed x-mailmon-signature header. Expected t=<timestamp>,v1=<hex_hmac>.",
    );
  }

  return { timestamp, signature };
}

function getNowSeconds(now: Date | number | undefined): number {
  if (now instanceof Date) {
    return Math.floor(now.getTime() / 1000);
  }

  if (typeof now === "number") {
    return Math.floor(now / 1000);
  }

  return Math.floor(Date.now() / 1000);
}

function assertTimestampWithinTolerance(
  timestamp: string,
  toleranceSeconds: number,
  now: Date | number | undefined,
): void {
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) {
    throw new MailmonWebhookSignatureError(
      "Webhook signature tolerance must be a non-negative number.",
    );
  }

  if (!/^\d+$/.test(timestamp)) {
    throw new MailmonWebhookSignatureError(
      "Webhook signature timestamp is invalid.",
    );
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    throw new MailmonWebhookSignatureError(
      "Webhook signature timestamp is invalid.",
    );
  }

  if (Math.abs(getNowSeconds(now) - timestampSeconds) > toleranceSeconds) {
    throw new MailmonWebhookSignatureError(
      "Webhook signature timestamp is outside the tolerance window.",
    );
  }
}

function secureCompareHex(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (actualBuffer.length === 0 || actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifySignature(
  payload: WebhookPayload,
  signatureHeader: string | undefined,
  secret: string,
  options: WebhookSignatureOptions = {},
): true {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new MailmonWebhookSignatureError(
      "Webhook signing secret is required.",
    );
  }

  const body = toUtf8Body(payload);
  const { timestamp, signature } = parseSignatureHeader(signatureHeader);
  const toleranceSeconds =
    options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  assertTimestampWithinTolerance(timestamp, toleranceSeconds, options.now);

  const expectedSignature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  if (!secureCompareHex(signature, expectedSignature)) {
    throw new MailmonWebhookSignatureError(
      "Webhook signature verification failed.",
    );
  }

  return true;
}

export function constructEvent<T = WebhookEventEnvelope>(
  payload: WebhookPayload,
  signatureHeader: string | undefined,
  secret: string,
  options: WebhookSignatureOptions = {},
): T {
  verifySignature(payload, signatureHeader, secret, options);

  try {
    return JSON.parse(toUtf8Body(payload)) as T;
  } catch (error) {
    throw new MailmonWebhookSignatureError(
      error instanceof Error
        ? `Webhook payload is not valid JSON: ${error.message}`
        : "Webhook payload is not valid JSON.",
    );
  }
}
