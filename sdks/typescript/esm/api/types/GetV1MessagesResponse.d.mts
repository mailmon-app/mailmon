export interface GetV1MessagesResponse {
    object: GetV1MessagesResponse.Object_;
    data: GetV1MessagesResponse.Data.Item[];
    nextCursor: string | null;
}
export declare namespace GetV1MessagesResponse {
    const Object_: {
        readonly List: "list";
    };
    type Object_ = (typeof Object_)[keyof typeof Object_];
    type Data = Data.Item[];
    namespace Data {
        interface Item {
            id: string;
            mailboxId: string;
            threadId: string;
            providerMessageId: string;
            subject: string;
            from: Item.From;
            snippet: string;
            receivedAt: string;
            labelIds: string[];
        }
        namespace Item {
            interface From {
                name: string | null;
                email: string;
            }
        }
    }
}
