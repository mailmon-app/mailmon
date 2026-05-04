import type * as Mailmon from "../../index.mjs";
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
    tenantExternalId: Mailmon.NonEmptyString;
    mailboxExternalId: Mailmon.NonEmptyString;
    redirectUrl: Mailmon.NonEmptyString;
}
export declare namespace PostV1MailboxesConnectSessionsRequest {
    const Provider: {
        readonly Gmail: "gmail";
    };
    type Provider = (typeof Provider)[keyof typeof Provider];
}
