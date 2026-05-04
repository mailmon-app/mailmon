import type * as Mailmon from "../../index.mjs";
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
