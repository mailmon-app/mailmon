import { describe, expect, it } from "vitest";

import type { CompletedSyncRun, ProblemDetails } from "./contracts.js";
import {
  isTerminalMailboxCredentialProblem,
  isTerminalMailboxSyncProblem,
  transitionForCompletedSyncRun,
  transitionForCredentialUnreadable,
  transitionForDispatchRetryExhausted,
  transitionForStuckExecutionRecovery,
  transitionForWatchRenewalFailure,
} from "./mailbox-operational-state.js";

const completedSyncRun = (
  detail: string | null,
  status: CompletedSyncRun["status"] = "failed_after_lease_acquired",
): CompletedSyncRun => ({
  syncRunId: "sr_policy",
  mailboxId: "mbx_policy",
  completedAt: "2026-04-22T03:00:00.000Z",
  status,
  eventsEmitted: 0,
  nextCursor: null,
  detail,
});

const problem = (code: string): ProblemDetails => ({
  type: `https://api.mailmon.dev/problems/${code}`,
  title: code,
  status: 409,
  code,
  detail: `Problem detail for ${code}.`,
  retryable: code !== "gmail_token_refresh_reconnect_required",
});

describe("mailbox operational state policy", () => {
  it("classifies terminal mailbox credential and sync problem codes", () => {
    expect(isTerminalMailboxCredentialProblem("gmail_token_refresh_reconnect_required")).toBe(true);
    expect(isTerminalMailboxCredentialProblem("gmail_mailbox_credential_unreadable")).toBe(true);
    expect(isTerminalMailboxCredentialProblem("gmail_mailbox_credentials_missing")).toBe(true);
    expect(isTerminalMailboxCredentialProblem("gmail_rate_limited")).toBe(false);
    expect(isTerminalMailboxSyncProblem("gmail_token_refresh_reconnect_required")).toBe(true);
  });

  it("maps gmail_token_refresh_reconnect_required to reconnect-required failed sync", () => {
    expect(
      transitionForCompletedSyncRun(completedSyncRun("gmail_token_refresh_reconnect_required")),
    ).toEqual({
      lastError: {
        code: "gmail_token_refresh_reconnect_required",
        message:
          "Refreshing the Gmail access token failed because the stored Gmail refresh token is invalid or revoked. The mailbox must be reconnected.",
        occurredAt: "2026-04-22T03:00:00.000Z",
        retryable: false,
      },
      status: "reconnect_required",
      syncState: "failed",
    });
  });

  it("maps gmail_mailbox_credential_unreadable sync failures", () => {
    expect(
      transitionForCompletedSyncRun(completedSyncRun("gmail_mailbox_credential_unreadable")),
    ).toMatchObject({
      lastError: {
        code: "gmail_mailbox_credential_unreadable",
        retryable: false,
      },
      status: "reconnect_required",
      syncState: "failed",
    });
  });

  it("maps gmail_mailbox_credentials_missing sync failures", () => {
    expect(
      transitionForCompletedSyncRun(completedSyncRun("gmail_mailbox_credentials_missing")),
    ).toMatchObject({
      lastError: {
        code: "gmail_mailbox_credentials_missing",
        retryable: false,
      },
      status: "reconnect_required",
      syncState: "failed",
    });
  });

  it("maps gmail_history_cursor_invalid to lagging retryable sync state", () => {
    expect(transitionForCompletedSyncRun(completedSyncRun("gmail_history_cursor_invalid"))).toEqual(
      {
        lastError: {
          code: "gmail_history_cursor_invalid",
          message:
            "Mailbox requires a repair sync because the stored Gmail history cursor is invalid or expired.",
          occurredAt: "2026-04-22T03:00:00.000Z",
          retryable: true,
        },
        syncState: "lagging",
      },
    );
  });

  it("maps gmail_rate_limited to lagging retryable sync state", () => {
    expect(transitionForCompletedSyncRun(completedSyncRun("gmail_rate_limited"))).toMatchObject({
      lastError: {
        code: "gmail_rate_limited",
        message: "Gmail temporarily rate-limited sync operations for this mailbox.",
        retryable: true,
      },
      syncState: "lagging",
    });
  });

  it("maps mailbox_cursor_regressed to lagging non-retryable sync state", () => {
    expect(
      transitionForCompletedSyncRun(completedSyncRun("mailbox_cursor_regressed")),
    ).toMatchObject({
      lastError: {
        code: "mailbox_cursor_regressed",
        retryable: false,
      },
      syncState: "lagging",
    });
  });

  it("maps mailbox_sync_dispatch_retry_exhausted to failed retryable sync state", () => {
    expect(transitionForDispatchRetryExhausted({ occurredAt: "2026-04-22T04:00:00.000Z" })).toEqual(
      {
        lastError: {
          code: "mailbox_sync_dispatch_retry_exhausted",
          message:
            "Mailbox sync dispatch exhausted transport retries before a worker could process it.",
          occurredAt: "2026-04-22T04:00:00.000Z",
          retryable: true,
        },
        syncState: "failed",
      },
    );
  });

  it("maps lease_lost sync failures", () => {
    expect(
      transitionForCompletedSyncRun(completedSyncRun("mailbox_sync_lease_lost", "lease_lost")),
    ).toMatchObject({
      lastError: {
        code: "mailbox_sync_lease_lost",
        message: "Mailbox sync lost the active mailbox lease while processing.",
        retryable: true,
      },
      syncState: "failed",
    });
  });

  it("maps generic failed-after-lease-acquired problems", () => {
    expect(transitionForCompletedSyncRun(completedSyncRun("gmail_unavailable"))).toMatchObject({
      lastError: {
        code: "gmail_unavailable",
        message: "Mailbox sync failed after the mailbox lease was acquired.",
        retryable: true,
      },
      syncState: "failed",
    });
  });

  it("maps watch renewal failure before expiration", () => {
    expect(
      transitionForWatchRenewalFailure({
        observedAt: "2026-04-22T03:00:00.000Z",
        watchExpiresAt: "2026-04-22T04:00:00.000Z",
        problem: problem("gmail_watch_renewal_failed"),
      }),
    ).toMatchObject({
      lastError: {
        code: "gmail_watch_renewal_failed",
        retryable: true,
      },
      watchState: "unhealthy",
    });
  });

  it("maps watch renewal failure after expiration", () => {
    expect(
      transitionForWatchRenewalFailure({
        observedAt: "2026-04-22T04:00:00.000Z",
        watchExpiresAt: "2026-04-22T03:00:00.000Z",
        problem: problem("gmail_watch_renewal_failed"),
      }),
    ).toMatchObject({
      watchState: "expired",
    });
  });

  it("maps unreadable credentials and stuck execution recovery", () => {
    expect(
      transitionForCredentialUnreadable({ occurredAt: "2026-04-22T03:00:00.000Z" }),
    ).toMatchObject({
      lastError: {
        code: "gmail_mailbox_credential_unreadable",
        retryable: false,
      },
      status: "reconnect_required",
      syncState: "failed",
    });
    expect(
      transitionForStuckExecutionRecovery({ occurredAt: "2026-04-22T03:00:00.000Z" }),
    ).toMatchObject({
      lastError: {
        code: "stuck_mailbox_execution_recovered",
        retryable: true,
      },
      syncState: "lagging",
    });
  });
});
