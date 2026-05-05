import type * as Mailmon from "../../index.mjs";
/**
 * @example
 *     {
 *         mailboxId: "mailboxId"
 *     }
 */
export interface GetV1MessagesRequest {
    cursor?: string;
    limit?: number;
    mailboxId: Mailmon.NonEmptyString;
}
