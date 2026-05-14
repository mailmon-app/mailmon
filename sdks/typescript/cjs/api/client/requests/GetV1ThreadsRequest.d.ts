/**
 * @example
 *     {
 *         mailboxId: "mailboxId"
 *     }
 */
export interface GetV1ThreadsRequest {
    cursor?: string;
    limit?: number;
    mailboxId: string;
}
