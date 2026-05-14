/**
 * @example
 *     {
 *         provider: "gmail",
 *         tenantExternalId: "tenantExternalId",
 *         mailboxExternalId: "mailboxExternalId",
 *         redirectUrl: "redirectUrl"
 *     }
 */
export interface PostV1MailboxesConnectSessionsRequest {
    provider: PostV1MailboxesConnectSessionsRequest.Provider;
    tenantExternalId: string;
    mailboxExternalId: string;
    redirectUrl: string;
}
export declare namespace PostV1MailboxesConnectSessionsRequest {
    const Provider: {
        readonly Gmail: "gmail";
    };
    type Provider = (typeof Provider)[keyof typeof Provider];
}
