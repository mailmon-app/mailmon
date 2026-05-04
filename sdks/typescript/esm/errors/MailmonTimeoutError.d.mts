export declare class MailmonTimeoutError extends Error {
    readonly cause?: unknown;
    constructor(message: string, opts?: {
        cause?: unknown;
    });
}
