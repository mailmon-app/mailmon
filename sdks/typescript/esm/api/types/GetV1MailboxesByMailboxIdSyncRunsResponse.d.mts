export interface GetV1MailboxesByMailboxIdSyncRunsResponse {
    object: GetV1MailboxesByMailboxIdSyncRunsResponse.Object_;
    data: GetV1MailboxesByMailboxIdSyncRunsResponse.Data.Item[];
    nextCursor: string | null;
}
export declare namespace GetV1MailboxesByMailboxIdSyncRunsResponse {
    const Object_: {
        readonly List: "list";
    };
    type Object_ = (typeof Object_)[keyof typeof Object_];
    type Data = Data.Item[];
    namespace Data {
        interface Item {
            syncRunId: string;
            mailboxId: string;
            startedAt: string;
            completedAt: string | null;
            status: Item.Status;
            detail: string | null;
            eventsEmitted: number | null;
            leaseOwnerId: string | null;
            previousCursor: string | null;
            nextCursor: string | null;
            cursorAdvanced: boolean | null;
        }
        namespace Item {
            const Status: {
                readonly Running: "running";
                readonly Completed: "completed";
                readonly SkippedDueToActiveLease: "skipped_due_to_active_lease";
                readonly ReconnectRequired: "reconnect_required";
                readonly DispatchRetryExhausted: "dispatch_retry_exhausted";
                readonly FailedAfterLeaseAcquired: "failed_after_lease_acquired";
                readonly LeaseLost: "lease_lost";
            };
            type Status = (typeof Status)[keyof typeof Status];
        }
    }
}
