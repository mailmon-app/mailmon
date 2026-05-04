import type * as core from "../../core/index.js";
import * as errors from "../../errors/index.js";
export declare class NotFoundError extends errors.MailmonError {
    constructor(body?: unknown, rawResponse?: core.RawResponse);
}
