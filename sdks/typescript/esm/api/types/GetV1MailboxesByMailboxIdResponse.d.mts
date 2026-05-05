export interface GetV1MailboxesByMailboxIdResponse {
    id: string;
    object: GetV1MailboxesByMailboxIdResponse.Object_;
    provider: GetV1MailboxesByMailboxIdResponse.Provider;
    emailAddress: string;
    status: GetV1MailboxesByMailboxIdResponse.Status;
    syncState: GetV1MailboxesByMailboxIdResponse.SyncState;
    watchState: GetV1MailboxesByMailboxIdResponse.WatchState;
    initializedAt: string | null;
    lastSuccessfulSyncAt: string | null;
    lastError: GetV1MailboxesByMailboxIdResponse.LastError | null;
}
export declare namespace GetV1MailboxesByMailboxIdResponse {
    const Object_: {
        readonly Mailbox: "mailbox";
    };
    type Object_ = (typeof Object_)[keyof typeof Object_];
    const Provider: {
        readonly Gmail: "gmail";
    };
    type Provider = (typeof Provider)[keyof typeof Provider];
    const Status: {
        readonly Active: "active";
        readonly ReconnectRequired: "reconnect_required";
        readonly Disabled: "disabled";
    };
    type Status = (typeof Status)[keyof typeof Status];
    const SyncState: {
        readonly Initializing: "initializing";
        readonly Healthy: "healthy";
        readonly Lagging: "lagging";
        readonly Failed: "failed";
    };
    type SyncState = (typeof SyncState)[keyof typeof SyncState];
    const WatchState: {
        readonly Active: "active";
        readonly Expiring: "expiring";
        readonly Expired: "expired";
        readonly Unhealthy: "unhealthy";
    };
    type WatchState = (typeof WatchState)[keyof typeof WatchState];
    interface LastError {
        code: string;
        message: string;
        occurredAt: string;
        retryable: boolean;
    }
}
