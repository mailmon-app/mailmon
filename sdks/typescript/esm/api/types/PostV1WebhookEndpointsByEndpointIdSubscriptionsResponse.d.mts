export interface PostV1WebhookEndpointsByEndpointIdSubscriptionsResponse {
    object: PostV1WebhookEndpointsByEndpointIdSubscriptionsResponse.Object_;
    data: PostV1WebhookEndpointsByEndpointIdSubscriptionsResponse.Data.Item[];
    nextCursor: string | null;
}
export declare namespace PostV1WebhookEndpointsByEndpointIdSubscriptionsResponse {
    const Object_: {
        readonly List: "list";
    };
    type Object_ = (typeof Object_)[keyof typeof Object_];
    type Data = Data.Item[];
    namespace Data {
        interface Item {
            id: string;
            object: Item.Object_;
            webhookEndpointId: string;
            mailboxId: string;
            eventTypes: Item.EventTypes.Item[];
            createdAt: string;
        }
        namespace Item {
            const Object_: {
                readonly WebhookEndpointSubscription: "webhook_endpoint_subscription";
            };
            type Object_ = (typeof Object_)[keyof typeof Object_];
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
    }
}
