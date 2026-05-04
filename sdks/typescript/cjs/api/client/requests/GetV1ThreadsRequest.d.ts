import type * as Mailmon from "../../index.js";
/**
 * @example
 *     {}
 */
export interface GetV1ThreadsRequest {
    cursor?: string;
    /** a string to be decoded into a number */
    limit?: string;
    mailboxId?: Mailmon.NonEmptyString;
}
