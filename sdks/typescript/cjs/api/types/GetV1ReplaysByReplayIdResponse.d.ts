export interface GetV1ReplaysByReplayIdResponse {
    id: string;
    object: GetV1ReplaysByReplayIdResponse.Object_;
    status: GetV1ReplaysByReplayIdResponse.Status;
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
export declare namespace GetV1ReplaysByReplayIdResponse {
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
