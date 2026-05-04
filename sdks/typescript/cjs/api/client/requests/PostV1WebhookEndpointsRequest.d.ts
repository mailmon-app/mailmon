import type * as Mailmon from "../../index.js";
/**
 * @example
 *     {
 *         url: "url"
 *     }
 */
export interface PostV1WebhookEndpointsRequest {
    url: Mailmon.NonEmptyString;
    description?: Mailmon.NonEmptyString | null;
}
