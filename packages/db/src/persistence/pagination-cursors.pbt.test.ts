import { describe, expect, it } from "@effect/vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";

import { hegelSettings, notePbtCase } from "../test-hegel.js";
import {
  decodePaginationCursor,
  decodeSyncRunPaginationCursor,
  encodePaginationCursor,
  encodeSyncRunPaginationCursor,
} from "./pagination-cursors.js";
import { isProblemDetails } from "./problems.js";

const cursorIdGen = gs.text({
  alphabet: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-",
  minSize: 1,
  maxSize: 32,
});
const resourceTypeGen = gs.sampledFrom(["messages", "threads"] as const);
const isoTimestampGen = gs
  .integers({
    minValue: Date.parse("2020-01-01T00:00:00.000Z"),
    maxValue: Date.parse("2030-12-31T23:59:59.999Z"),
  })
  .map((timestamp) => new Date(timestamp).toISOString());

const encodedCursorPayload = (payload: unknown) =>
  `cur_${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;

const expectInvalidPaginationCursor = (decode: () => unknown) => {
  try {
    decode();
  } catch (error) {
    expect(isProblemDetails(error)).toBe(true);

    if (isProblemDetails(error)) {
      expect(error.code).toBe("invalid_pagination_cursor");
    }

    return;
  }

  throw new Error("expected invalid_pagination_cursor");
};

describe("Pagination cursor properties", () => {
  it(
    "round-trips generated message and thread pagination cursors",
    () =>
      hegel.test((tc) => {
        const cursor = {
          id: tc.draw(cursorIdGen),
          timestamp: tc.draw(isoTimestampGen),
        };
        const resourceType = tc.draw(resourceTypeGen);

        notePbtCase(tc, "pagination-cursors-roundtrip-and-reject-junk", {
          family: "resource-pagination-cursor-roundtrip",
          resourceType,
          cursor,
        });

        expect(decodePaginationCursor(resourceType, encodePaginationCursor(cursor))).toEqual(
          cursor,
        );
      }, hegelSettings),
    60_000,
  );

  it(
    "round-trips generated sync run pagination cursors",
    () =>
      hegel.test((tc) => {
        const cursor = {
          id: tc.draw(cursorIdGen),
          startedAt: tc.draw(isoTimestampGen),
        };

        notePbtCase(tc, "pagination-cursors-roundtrip-and-reject-junk", {
          family: "sync-run-pagination-cursor-roundtrip",
          cursor,
        });

        expect(decodeSyncRunPaginationCursor(encodeSyncRunPaginationCursor(cursor))).toEqual(
          cursor,
        );
      }, hegelSettings),
    60_000,
  );

  it(
    "rejects generated malformed message and thread pagination cursors",
    () =>
      hegel.test((tc) => {
        const resourceType = tc.draw(resourceTypeGen);
        const validId = tc.draw(cursorIdGen);
        const validTimestamp = tc.draw(isoTimestampGen);
        const malformedCursor = tc.draw(
          gs.sampledFrom([
            "not_cur_prefix",
            "cur_%%%",
            encodedCursorPayload(null),
            encodedCursorPayload({ id: "", timestamp: validTimestamp }),
            encodedCursorPayload({ id: validId, timestamp: "not-a-date" }),
            encodedCursorPayload({ id: validId, timestamp: "123" }),
            encodedCursorPayload({ id: validId, timestamp: "2026-02-31T00:00:00.000Z" }),
            encodedCursorPayload({ id: validId, timestamp: "2026-03-24T00:00:00Z" }),
            encodedCursorPayload({ id: validId }),
            encodedCursorPayload({ timestamp: validTimestamp }),
          ]),
        );

        notePbtCase(tc, "pagination-cursors-roundtrip-and-reject-junk", {
          family: "malformed-resource-pagination-cursor",
          resourceType,
          validId,
          validTimestamp,
          malformedCursor,
        });

        expectInvalidPaginationCursor(() => decodePaginationCursor(resourceType, malformedCursor));
      }, hegelSettings),
    60_000,
  );

  it("rejects JavaScript-parseable non-canonical timestamp strings", () => {
    for (const timestamp of ["123", "2026-02-31T00:00:00.000Z", "2026-03-24T00:00:00Z"]) {
      expectInvalidPaginationCursor(() =>
        decodePaginationCursor(
          "messages",
          encodedCursorPayload({
            id: "msg_property",
            timestamp,
          }),
        ),
      );
      expectInvalidPaginationCursor(() =>
        decodeSyncRunPaginationCursor(
          encodedCursorPayload({
            id: "sync_property",
            startedAt: timestamp,
          }),
        ),
      );
    }
  });

  it(
    "rejects generated malformed sync run pagination cursors",
    () =>
      hegel.test((tc) => {
        const validId = tc.draw(cursorIdGen);
        const validStartedAt = tc.draw(isoTimestampGen);
        const malformedCursor = tc.draw(
          gs.sampledFrom([
            "not_cur_prefix",
            "cur_%%%",
            encodedCursorPayload(null),
            encodedCursorPayload({ id: "", startedAt: validStartedAt }),
            encodedCursorPayload({ id: validId, startedAt: "not-a-date" }),
            encodedCursorPayload({ id: validId, startedAt: "123" }),
            encodedCursorPayload({ id: validId, startedAt: "2026-02-31T00:00:00.000Z" }),
            encodedCursorPayload({ id: validId, startedAt: "2026-03-24T00:00:00Z" }),
            encodedCursorPayload({ id: validId }),
            encodedCursorPayload({ startedAt: validStartedAt }),
          ]),
        );

        notePbtCase(tc, "pagination-cursors-roundtrip-and-reject-junk", {
          family: "malformed-sync-run-pagination-cursor",
          validId,
          validStartedAt,
          malformedCursor,
        });

        expectInvalidPaginationCursor(() => decodeSyncRunPaginationCursor(malformedCursor));
      }, hegelSettings),
    60_000,
  );
});
