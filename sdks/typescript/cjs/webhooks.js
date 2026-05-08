"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.constructEvent = exports.verifySignature = exports.MailmonWebhookSignatureError = void 0;
const node_crypto_1 = require("node:crypto");
const DEFAULT_TOLERANCE_SECONDS = 300;
class MailmonWebhookSignatureError extends Error {
    constructor(message) {
        super(message);
        this.name = "MailmonWebhookSignatureError";
    }
}
exports.MailmonWebhookSignatureError = MailmonWebhookSignatureError;
const toUtf8Body = (payload) => {
    if (typeof payload === "string") {
        return payload;
    }
    if (payload instanceof ArrayBuffer) {
        return Buffer.from(payload).toString("utf8");
    }
    if (ArrayBuffer.isView(payload)) {
        return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString("utf8");
    }
    throw new MailmonWebhookSignatureError("Webhook payload must be the raw request body as a string, Buffer, Uint8Array, or ArrayBuffer.");
};
const parseSignatureHeader = (signatureHeader) => {
    if (typeof signatureHeader !== "string" || signatureHeader.length === 0) {
        throw new MailmonWebhookSignatureError("Missing x-mailmon-signature header.");
    }
    const parts = new Map();
    for (const item of signatureHeader.split(",")) {
        const [key, ...valueParts] = item.split("=");
        if (key !== undefined && valueParts.length > 0) {
            parts.set(key.trim(), valueParts.join("=").trim());
        }
    }
    const timestamp = parts.get("t");
    const signature = parts.get("v1");
    if (timestamp === undefined || signature === undefined) {
        throw new MailmonWebhookSignatureError("Malformed x-mailmon-signature header. Expected t=<timestamp>,v1=<hex_hmac>.");
    }
    return { timestamp, signature };
};
const getNowSeconds = (now) => {
    if (now instanceof Date) {
        return Math.floor(now.getTime() / 1000);
    }
    if (typeof now === "number") {
        return Math.floor(now / 1000);
    }
    return Math.floor(Date.now() / 1000);
};
const assertTimestampWithinTolerance = (timestamp, toleranceSeconds, now) => {
    if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) {
        throw new MailmonWebhookSignatureError("Webhook signature tolerance must be a non-negative number.");
    }
    if (!/^\d+$/.test(timestamp)) {
        throw new MailmonWebhookSignatureError("Webhook signature timestamp is invalid.");
    }
    const timestampSeconds = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(timestampSeconds)) {
        throw new MailmonWebhookSignatureError("Webhook signature timestamp is invalid.");
    }
    if (Math.abs(getNowSeconds(now) - timestampSeconds) > toleranceSeconds) {
        throw new MailmonWebhookSignatureError("Webhook signature timestamp is outside the tolerance window.");
    }
};
const secureCompareHex = (actual, expected) => {
    const actualBuffer = Buffer.from(actual, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (actualBuffer.length === 0 || actualBuffer.length !== expectedBuffer.length) {
        return false;
    }
    return (0, node_crypto_1.timingSafeEqual)(actualBuffer, expectedBuffer);
};
const verifySignature = (payload, signatureHeader, secret, options = {}) => {
    if (typeof secret !== "string" || secret.length === 0) {
        throw new MailmonWebhookSignatureError("Webhook signing secret is required.");
    }
    const body = toUtf8Body(payload);
    const { timestamp, signature } = parseSignatureHeader(signatureHeader);
    const toleranceSeconds = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
    assertTimestampWithinTolerance(timestamp, toleranceSeconds, options.now);
    const expectedSignature = (0, node_crypto_1.createHmac)("sha256", secret)
        .update(`${timestamp}.${body}`)
        .digest("hex");
    if (!secureCompareHex(signature, expectedSignature)) {
        throw new MailmonWebhookSignatureError("Webhook signature verification failed.");
    }
    return true;
};
exports.verifySignature = verifySignature;
const constructEvent = (payload, signatureHeader, secret, options = {}) => {
    (0, exports.verifySignature)(payload, signatureHeader, secret, options);
    try {
        return JSON.parse(toUtf8Body(payload));
    }
    catch (error) {
        throw new MailmonWebhookSignatureError(error instanceof Error ? `Webhook payload is not valid JSON: ${error.message}` : "Webhook payload is not valid JSON.");
    }
};
exports.constructEvent = constructEvent;
