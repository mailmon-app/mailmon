import type * as core from "../../core/index.mjs";
import * as errors from "../../errors/index.mjs";
export declare class ConflictError extends errors.MailmonError {
    constructor(body?: unknown, rawResponse?: core.RawResponse);
}
