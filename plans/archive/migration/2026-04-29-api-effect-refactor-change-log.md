# API Effect Refactor Change Log

Date: 2026-04-29
Scope: `apps/api`

## Adapter Structure

- Extracted request parsing into `apps/api/src/http/parsers.ts`.
- Extracted bearer auth, Effect execution, and Problem Envelope response mapping into `apps/api/src/http/handlers.ts`.
- Refactored API routes to use a shared auth, parse, execute, respond pipeline while keeping product workflows in `@mailmon/core`.
- Simplified API runtime async transport mode selection without changing supported modes.

## Validation Tightening

- `POST /v1/mailboxes/connect-sessions` malformed JSON now returns `400 invalid_request` with detail `Body must be valid JSON.`.
- `GET /v1/messages` and other list-style API parser paths reject non-integer `limit` values with detail `Query parameter limit must be an integer between 1 and 100.`.
- `GET /v1/messages` and `GET /v1/threads` missing both `mailboxId` and `mailbox_id` now return detail `Query must include mailboxId or mailbox_id.` through the shared parser.
- `POST /v1/webhook-endpoints/{endpoint_id}/subscriptions` unsupported webhook event types now return a deterministic `400 invalid_request` with detail `Body eventTypes/event_types must only include message.created, message.updated, or thread.updated.`.

## Verification

- `apps/api/src/server.test.ts` covers route-level deterministic validation behavior.
- `apps/api/src/http/parsers.test.ts` covers parser contracts for aliases, malformed JSON, limits, and webhook event types.
- `apps/api/src/http/handlers.test.ts` covers bearer extraction, auth failure behavior, and Effect success/failure mapping.
- `apps/api/src/runtime.test.ts` covers API runtime mode selection guardrails.
