export interface PostV1MailboxesConnectSessionsResponse {
    id: string;
    object: PostV1MailboxesConnectSessionsResponse.Object_;
    connectUrl: string;
    expiresAt: string;
}
export declare namespace PostV1MailboxesConnectSessionsResponse {
    const Object_: {
        readonly ConnectSession: "connect_session";
    };
    type Object_ = (typeof Object_)[keyof typeof Object_];
}
