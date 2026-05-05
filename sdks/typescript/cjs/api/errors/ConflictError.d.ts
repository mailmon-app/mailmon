import type * as core from "../../core/index.js";
import * as errors from "../../errors/index.js";
import type * as Mailmon from "../index.js";
export declare class ConflictError extends errors.MailmonError {
    constructor(body: Mailmon.ConflictErrorBody, rawResponse?: core.RawResponse);
}
