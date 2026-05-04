/**
 * @example
 *     {
 *         mailboxId: "mailboxId"
 *     }
 */
export interface GetV1MailboxesByMailboxIdSyncRunsRequest {
    mailboxId: string;
    cursor?: string;
    /** a string to be decoded into a number */
    limit?: string;
}
