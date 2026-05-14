/**
 * @example
 *     {
 *         mailboxId: "mailboxId"
 *     }
 */
export interface GetV1MessagesRequest {
    cursor?: string;
    limit?: number;
    mailboxId: string;
}
