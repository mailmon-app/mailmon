export interface PostV1WebhookEndpointsResponse {
    id: string;
    object: PostV1WebhookEndpointsResponse.Object_;
    url: string;
    description: string | null;
    deliveryState: PostV1WebhookEndpointsResponse.DeliveryState;
    lastDeliveryAt: string | null;
    lastDeliveryError: PostV1WebhookEndpointsResponse.LastDeliveryError | null;
    createdAt: string;
    secret: string;
}
export declare namespace PostV1WebhookEndpointsResponse {
    const Object_: {
        readonly WebhookEndpoint: "webhook_endpoint";
    };
    type Object_ = (typeof Object_)[keyof typeof Object_];
    const DeliveryState: {
        readonly Healthy: "healthy";
        readonly Degraded: "degraded";
        readonly Failing: "failing";
    };
    type DeliveryState = (typeof DeliveryState)[keyof typeof DeliveryState];
    interface LastDeliveryError {
        code: string;
        message: string;
        occurredAt: string;
        retryable: boolean;
    }
}
