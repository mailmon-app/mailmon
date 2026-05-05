export interface PostV1ReplaysResponse {
    id: string;
    object: PostV1ReplaysResponse.Object_;
    status: PostV1ReplaysResponse.Status;
    mailboxId: string;
    webhookEndpointId: string;
    startTime: string;
    endTime: string;
    eventsReplayed: number | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    lastError: string | null;
}
export declare namespace PostV1ReplaysResponse {
    const Object_: {
        readonly Replay: "replay";
    };
    type Object_ = (typeof Object_)[keyof typeof Object_];
    const Status: {
        readonly Queued: "queued";
        readonly Running: "running";
        readonly Completed: "completed";
        readonly Failed: "failed";
        readonly Cancelled: "cancelled";
    };
    type Status = (typeof Status)[keyof typeof Status];
}
