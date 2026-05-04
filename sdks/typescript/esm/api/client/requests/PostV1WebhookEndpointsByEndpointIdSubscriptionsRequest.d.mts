import type * as Mailmon from "../../index.mjs";
/**
 * @example
 *     {
 *         endpointId: "endpointId",
 *         mailboxIds: ["mailboxIds"],
 *         eventTypes: ["message.created"]
 *     }
 */
export interface PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest {
    endpointId: string;
    mailboxIds: Mailmon.NonEmptyString[];
    eventTypes: PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest.EventTypes.Item[];
}
export declare namespace PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest {
    type EventTypes = EventTypes.Item[];
    namespace EventTypes {
        const Item: {
            readonly MessageCreated: "message.created";
            readonly MessageUpdated: "message.updated";
            readonly ThreadUpdated: "thread.updated";
        };
        type Item = (typeof Item)[keyof typeof Item];
    }
}
