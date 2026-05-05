/**
 * @example
 *     {
 *         mailboxId: "mailboxId"
 *     }
 */
export interface GetV1MailboxesByMailboxIdSyncRunsRequest {
    mailboxId: string;
    cursor?: string;
    limit?: number;
}
