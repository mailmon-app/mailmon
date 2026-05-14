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
    mailboxId: string;
    webhookEndpointId: string;
    startTime: string;
    endTime: string;
}
