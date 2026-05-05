export interface GetV1ThreadsResponse {
    object: GetV1ThreadsResponse.Object_;
    data: GetV1ThreadsResponse.Data.Item[];
    nextCursor: string | null;
}
export declare namespace GetV1ThreadsResponse {
    const Object_: {
        readonly List: "list";
    };
    type Object_ = (typeof Object_)[keyof typeof Object_];
    type Data = Data.Item[];
    namespace Data {
        interface Item {
            id: string;
            object: Item.Object_;
            mailboxId: string;
            providerThreadId: string;
            subject: string;
            lastMessageAt: string;
        }
        namespace Item {
            const Object_: {
                readonly Thread: "thread";
            };
            type Object_ = (typeof Object_)[keyof typeof Object_];
        }
    }
}
