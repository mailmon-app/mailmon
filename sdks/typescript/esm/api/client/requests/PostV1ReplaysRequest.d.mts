import type * as Mailmon from "../../index.mjs";
/**
 * @example
 *     {
 *         mailboxId: "mailboxId",
 *         webhookEndpointId: "webhookEndpointId",
 *         startTime: "startTime",
 *         endTime: "endTime"
 *     }
 */
export interface PostV1ReplaysRequest {
    mailboxId: Mailmon.NonEmptyString;
    webhookEndpointId: Mailmon.NonEmptyString;
    startTime: Mailmon.NonEmptyString;
    endTime: Mailmon.NonEmptyString;
}
