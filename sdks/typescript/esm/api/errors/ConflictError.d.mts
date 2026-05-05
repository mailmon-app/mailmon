import type * as core from "../../core/index.mjs";
import * as errors from "../../errors/index.mjs";
import type * as Mailmon from "../index.mjs";
export declare class ConflictError extends errors.MailmonError {
    constructor(body: Mailmon.ConflictErrorBody, rawResponse?: core.RawResponse);
}
