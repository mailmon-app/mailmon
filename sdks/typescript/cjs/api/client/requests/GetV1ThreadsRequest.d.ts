import type * as Mailmon from "../../index.js";
/**
 * @example
 *     {
 *         mailboxId: "mailboxId"
 *     }
 */
export interface GetV1ThreadsRequest {
    cursor?: string;
    limit?: number;
    mailboxId: Mailmon.NonEmptyString;
}
