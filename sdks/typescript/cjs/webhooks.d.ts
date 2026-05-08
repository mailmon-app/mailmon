export type WebhookPayload = string | Uint8Array | ArrayBuffer;

export interface WebhookSignatureOptions {
    /**
     * Maximum age of the signature timestamp in seconds.
     *
     * @default 300
     */
    toleranceSeconds?: number;
    /**
     * Override the current time for deterministic tests. Numbers are interpreted as
     * milliseconds since the Unix epoch, matching Date.now().
     */
    now?: Date | number;
}

export declare class MailmonWebhookSignatureError extends Error {
    constructor(message: string);
}

export declare const verifySignature: (
    payload: WebhookPayload,
    signatureHeader: string | undefined,
    secret: string,
    options?: WebhookSignatureOptions,
) => true;

export declare const constructEvent: <T = unknown>(
    payload: WebhookPayload,
    signatureHeader: string | undefined,
    secret: string,
    options?: WebhookSignatureOptions,
) => T;
