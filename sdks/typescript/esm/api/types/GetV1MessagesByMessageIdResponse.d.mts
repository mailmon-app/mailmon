export interface GetV1MessagesByMessageIdResponse {
    id: string;
    mailboxId: string;
    threadId: string;
    providerMessageId: string;
    subject: string;
    from: GetV1MessagesByMessageIdResponse.From;
    snippet: string;
    receivedAt: string;
    labelIds: string[];
}
export declare namespace GetV1MessagesByMessageIdResponse {
    interface From {
        name: string | null;
        email: string;
    }
}
