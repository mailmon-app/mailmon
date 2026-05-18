import { describe, expect, it } from "@effect/vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { Duration, Effect, Layer, Option } from "effect";

import type {
  CompletedSyncRun,
  MailboxProviderSyncResult,
  MailboxResource,
  MailboxSyncSnapshot,
  ProblemDetails,
  SyncMailboxResult,
} from "./contracts.js";
import { runMailboxSync } from "./mailbox-sync-execution.js";
import { makeProblem } from "./problems.js";
import {
  MailboxCatalog,
  MailboxStateStore,
  MailboxSyncCoordinator,
  MailboxSyncLeaseTiming,
  MailboxSyncProvider,
  SyncRunStore,
  WebhookDeliveryScheduler,
  WebhookDeliveryStore,
} from "./services.js";
import { hegelSettings, notePbtCase } from "./test-hegel.js";

const mailbox: MailboxResource = {
  id: "mbx_single_flight_pbt",
  object: "mailbox",
  provider: "gmail",
  emailAddress: "single-flight@mailmon.dev",
  status: "active",
  syncState: "healthy",
  watchState: "active",
  initializedAt: null,
  lastSuccessfulSyncAt: null,
  lastError: null,
};

const initialCursor = "hist_0";
const providerDelayMsGen = gs.sampledFrom([5, 10, 25, 50] as const);
const providerOutcomeGen = gs.sampledFrom(["success", "transient-failure"] as const);

interface GeneratedAttempt {
  readonly index: number;
  readonly providerDelayMs: number;
  readonly providerOutcome: "success" | "transient-failure";
  readonly startDelayMs: number;
}

interface SyncOutcome {
  readonly kind: "success" | "failure";
  readonly result?: SyncMailboxResult;
  readonly problemCode?: string;
}

interface AppliedSnapshotRecord {
  readonly eventIds: ReadonlyArray<string>;
  readonly leaseOwnerId: string;
  readonly mailboxId: string;
  readonly nextCursor: string | null;
  readonly syncRunId: string;
}

const buildGeneratedAttempts = (tc: hegel.TestCase) => {
  const attemptCount = tc.draw(gs.integers({ minValue: 2, maxValue: 6 }));

  return Array.from({ length: attemptCount }, (_, index): GeneratedAttempt => {
    return {
      index,
      providerDelayMs: tc.draw(providerDelayMsGen),
      providerOutcome: tc.draw(providerOutcomeGen),
      startDelayMs: tc.draw(gs.integers({ minValue: 0, maxValue: 5 })),
    };
  });
};

const buildProviderSnapshot = (providerCallIndex: number): MailboxSyncSnapshot => {
  const threadId = `thr_provider_${providerCallIndex}`;
  const providerThreadId = `gmail_thr_provider_${providerCallIndex}`;
  const messageId = `msg_provider_${providerCallIndex}`;
  const providerMessageId = `gmail_msg_provider_${providerCallIndex}`;

  return {
    deletedProviderMessageIds: [],
    threads: [
      {
        id: threadId,
        providerThreadId,
        subject: `Single flight ${providerCallIndex}`,
        lastMessageAt: "2026-04-12T10:00:00.000Z",
      },
    ],
    messages: [
      {
        id: messageId,
        threadId,
        providerMessageId,
        providerThreadId,
        subject: `Single flight ${providerCallIndex}`,
        from: {
          name: "Mailmon PBT",
          email: "pbt@mailmon.dev",
        },
        snippet: `Generated single-flight message ${providerCallIndex}`,
        receivedAt: "2026-04-12T10:00:00.000Z",
        labelIds: ["INBOX"],
      },
    ],
  };
};

const providerProblem = (providerCallIndex: number): ProblemDetails =>
  makeProblem({
    type: "https://api.mailmon.dev/problems/generated-provider-failure",
    title: "Generated provider failure",
    status: 503,
    code: "generated_provider_failure",
    detail: `Generated provider failure for call ${providerCallIndex}.`,
    retryable: true,
  });

const expectSkippedRunHasNoSideEffects = (
  result: SyncMailboxResult,
  completedSyncRuns: ReadonlyArray<CompletedSyncRun>,
) => {
  expect(result.status).toBe("skipped_due_to_active_lease");
  expect(result.eventsEmitted).toBe(0);
  expect(result.nextCursor).toBeNull();

  expect(completedSyncRuns).toContainEqual(
    expect.objectContaining({
      syncRunId: result.syncRunId,
      status: "skipped_due_to_active_lease",
      eventsEmitted: 0,
      nextCursor: null,
    }),
  );
};

describe("Mailbox sync execution properties", () => {
  it(
    "mailbox-lease-single-flight allows at most one generated concurrent sync to apply",
    () =>
      hegel.testAsync(async (tc) => {
        const attempts = buildGeneratedAttempts(tc);
        const initialLease = tc.draw(gs.sampledFrom(["none", "preexisting-active-lease"] as const));

        notePbtCase(tc, "mailbox-lease-single-flight", {
          family: "core-service-model-concurrent-attempts",
          initialLease,
          attempts: attempts.map((attempt) => ({
            index: attempt.index,
            providerDelayMs: attempt.providerDelayMs,
            providerOutcome: attempt.providerOutcome,
            startDelayMs: attempt.startDelayMs,
          })),
        });

        let activeLeaseOwnerId: string | null =
          initialLease === "preexisting-active-lease" ? "lease_preexisting" : null;
        let syncRunCounter = 0;
        let storedCursor: string | null = initialCursor;
        const acquisitionCalls: Array<{
          leaseOwnerId: string;
          syncRunId: string;
        }> = [];
        const releaseCalls: Array<{
          leaseOwnerId: string;
        }> = [];
        const completedSyncRuns: Array<CompletedSyncRun> = [];
        const providerCalls: Array<{
          cursor: string | null;
          providerCallIndex: number;
        }> = [];
        const appliedSnapshots: Array<AppliedSnapshotRecord> = [];
        const scheduledDeliveryRequests: Array<{
          deliveryId: string;
          notBefore: string;
        }> = [];

        const testLayer = Layer.mergeAll(
          Layer.succeed(MailboxCatalog, {
            getMailbox: (mailboxId: string) =>
              Effect.succeed(mailboxId === mailbox.id ? Option.some(mailbox) : Option.none()),
          }),
          Layer.succeed(SyncRunStore, {
            startSyncRun: (mailboxId: string) =>
              Effect.sync(() => {
                const syncRunId = `sr_single_flight_${syncRunCounter}`;
                const startedAt = new Date(
                  Date.parse("2026-04-12T10:00:00.000Z") + syncRunCounter,
                ).toISOString();
                syncRunCounter += 1;

                return {
                  syncRunId,
                  mailboxId,
                  startedAt,
                };
              }),
            completeSyncRun: (result) =>
              Effect.sync(() => {
                completedSyncRuns.push(result);
              }),
          }),
          Layer.succeed(MailboxSyncCoordinator, {
            acquireMailboxSyncLease: (lease) =>
              Effect.sync(() => {
                acquisitionCalls.push({
                  leaseOwnerId: lease.leaseOwnerId,
                  syncRunId: lease.syncRunId,
                });

                if (activeLeaseOwnerId !== null) {
                  return {
                    acquired: false,
                    expiresAt: "2026-04-12T10:01:30.000Z",
                    leaseOwnerId: activeLeaseOwnerId,
                  };
                }

                activeLeaseOwnerId = lease.leaseOwnerId;

                return {
                  acquired: true,
                  expiresAt: lease.expiresAt,
                  leaseOwnerId: lease.leaseOwnerId,
                };
              }),
            renewMailboxSyncLease: (lease) =>
              Effect.succeed({
                renewed: activeLeaseOwnerId === lease.leaseOwnerId,
                expiresAt: activeLeaseOwnerId === lease.leaseOwnerId ? lease.expiresAt : null,
              }),
            releaseMailboxSyncLease: (lease) =>
              Effect.sync(() => {
                releaseCalls.push({
                  leaseOwnerId: lease.leaseOwnerId,
                });

                if (activeLeaseOwnerId === lease.leaseOwnerId) {
                  activeLeaseOwnerId = null;
                }
              }),
          }),
          MailboxSyncLeaseTiming.defaultLayer,
          Layer.succeed(MailboxSyncProvider, {
            syncMailbox: ({ cursor }) =>
              Effect.gen(function* () {
                const providerCallIndex = providerCalls.length;
                const attempt = attempts[providerCallIndex] ?? attempts.at(-1);

                if (attempt === undefined) {
                  return yield* Effect.die(new Error("Generated no sync attempts."));
                }

                providerCalls.push({
                  cursor,
                  providerCallIndex,
                });
                yield* Effect.sleep(Duration.millis(attempt.providerDelayMs));

                if (attempt.providerOutcome === "transient-failure") {
                  return yield* Effect.fail(providerProblem(providerCallIndex));
                }

                return {
                  snapshot: buildProviderSnapshot(providerCallIndex),
                  eventsEmitted: 2,
                  nextCursor: `hist_provider_${providerCallIndex}`,
                } satisfies MailboxProviderSyncResult;
              }),
          }),
          Layer.succeed(MailboxStateStore, {
            getMailboxCursor: () => Effect.succeed(storedCursor),
            applySyncResult: ({ mailboxId, leaseOwnerId, nextCursor, syncRunId }) =>
              Effect.sync(() => {
                if (activeLeaseOwnerId !== leaseOwnerId) {
                  return {
                    applied: false,
                    mailboxEventIds: [],
                  };
                }

                const eventIds = [`evt_${syncRunId}_0`, `evt_${syncRunId}_1`];
                storedCursor = nextCursor;
                appliedSnapshots.push({
                  eventIds,
                  leaseOwnerId,
                  mailboxId,
                  nextCursor,
                  syncRunId,
                });

                return {
                  applied: true,
                  mailboxEventIds: eventIds,
                };
              }),
          }),
          Layer.succeed(WebhookDeliveryStore, {
            createWebhookDeliveriesForMailboxEvents: (mailboxEventIds) =>
              Effect.succeed(
                mailboxEventIds.map((mailboxEventId) => ({
                  deliveryId: `del_${mailboxEventId}`,
                  notBefore: "2026-04-12T10:00:00.000Z",
                })),
              ),
            createWebhookDeliveriesForReplay: () => Effect.succeed([]),
            listWebhookDeliveryRecoverySchedules: () => Effect.succeed([]),
            prepareWebhookDeliveryAttempt: () => Effect.succeed(Option.none()),
            completeWebhookDeliveryAttempt: () => Effect.succeed(false),
          }),
          Layer.succeed(WebhookDeliveryScheduler, {
            scheduleWebhookDelivery: (request) =>
              Effect.sync(() => {
                scheduledDeliveryRequests.push(request);
              }),
          }),
        );

        const outcomes = await Effect.runPromise(
          Effect.all(
            attempts.map((attempt) =>
              Effect.sleep(Duration.millis(attempt.startDelayMs)).pipe(
                Effect.andThen(runMailboxSync(mailbox.id)),
                Effect.match({
                  onFailure: (problem): SyncOutcome => ({
                    kind: "failure",
                    problemCode: problem.code,
                  }),
                  onSuccess: (result): SyncOutcome => ({
                    kind: "success",
                    result,
                  }),
                }),
              ),
            ),
            { concurrency: "unbounded" },
          ).pipe(Effect.provide(testLayer)),
        );

        expect(acquisitionCalls).toHaveLength(attempts.length);
        expect(providerCalls.length).toBeLessThanOrEqual(1);
        expect(appliedSnapshots.length).toBeLessThanOrEqual(1);

        const skippedResults = outcomes.flatMap((outcome) =>
          outcome.kind === "success" && outcome.result?.status === "skipped_due_to_active_lease"
            ? [outcome.result]
            : [],
        );

        for (const result of skippedResults) {
          expectSkippedRunHasNoSideEffects(result, completedSyncRuns);
        }

        const appliedEventIds = appliedSnapshots.flatMap((snapshot) => [...snapshot.eventIds]);

        expect(scheduledDeliveryRequests.map((request) => request.deliveryId)).toEqual(
          appliedEventIds.map((eventId) => `del_${eventId}`),
        );

        if (appliedSnapshots.length === 0) {
          expect(storedCursor).toBe(initialCursor);
          expect(scheduledDeliveryRequests).toEqual([]);
        } else {
          expect(storedCursor).toBe(appliedSnapshots[0]?.nextCursor);
        }

        if (initialLease === "preexisting-active-lease") {
          expect(providerCalls).toEqual([]);
          expect(appliedSnapshots).toEqual([]);
          expect(releaseCalls).toEqual([]);
          expect(outcomes.every((outcome) => outcome.kind === "success")).toBe(true);
          expect(skippedResults).toHaveLength(attempts.length);
        }
      }, hegelSettings),
    60_000,
  );
});
