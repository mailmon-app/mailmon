export interface GetV1ThreadsByThreadIdResponse {
    id: string;
    object: GetV1ThreadsByThreadIdResponse.Object_;
    mailboxId: string;
    providerThreadId: string;
    subject: string;
    lastMessageAt: string;
    messages: GetV1ThreadsByThreadIdResponse.Messages.Item[];
}
export declare namespace GetV1ThreadsByThreadIdResponse {
    const Object_: {
        readonly Thread: "thread";
    };
    type Object_ = (typeof Object_)[keyof typeof Object_];
    type Messages = Messages.Item[];
    namespace Messages {
        interface Item {
            id: string;
            subject: string;
            receivedAt: string;
        }
    }
}
