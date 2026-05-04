# @mailmon.dev/cli

The Mailmon CLI provides local development utilities and operator back-office commands for managing workspaces, API keys, sync jobs, and event webhooks.

## Usage

In local development, the CLI is run via `pnpm` from the workspace root:

```bash
pnpm --filter @mailmon/cli dev -- <command>
```

Alternatively, from within the `apps/cli` directory:

```bash
pnpm dev -- <command>
```

## Commands

### `listen`

Listen for local webhook deliveries and optionally forward them to a local application endpoint.

```bash
pnpm dev -- listen --forward-to http://localhost:4000/webhooks/mailmon
```

### `replay`

Replay stored mailbox events into a local HTTP endpoint. Useful for testing webhook processing logic against historical data.

```bash
pnpm dev -- replay --mailbox <mailbox-id> --last 1h --forward-to http://localhost:4000/webhooks/mailmon
```

### `sync-mailbox`

Manually dispatch a mailbox sync through the local worker runtime.

```bash
pnpm dev -- sync-mailbox <mailbox-id>
```

### `control-job`

Trigger a background control job through the local worker runtime.

Supported job kinds:

- `renew_watches`
- `dispatch_replays`
- `repair_mailboxes`
- `recover_stuck_syncs`
- `cleanup`

```bash
pnpm dev -- control-job recover_stuck_syncs
```

### `admin workspace`

Manage Mailmon workspaces.

- `create`: Create a new workspace.
  ```bash
  pnpm dev -- admin workspace create
  ```

### `admin keys`

Manage workspace API keys.

- `create`: Create a new workspace API key and output the raw key.
  ```bash
  pnpm dev -- admin keys create --workspace-id <workspace-id>
  ```
- `revoke`: Revoke an existing workspace API key.
  ```bash
  pnpm dev -- admin keys revoke --key-id <key-id>
  ```

### `gmail-credentials`

Operate on persisted Gmail refresh-token credential envelopes in the database. Requires `DATABASE_URL` and `MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY`.

- `audit`: Audit stored Gmail refresh-token credential envelopes.
  ```bash
  pnpm dev -- gmail-credentials audit
  ```
- `rewrap`: Re-encrypt Gmail refresh-token credentials with the active key.
  ```bash
  pnpm dev -- gmail-credentials rewrap
  ```

## Development

The CLI is built with `@effect/cli`. To build it for production distribution:

```bash
pnpm build
```

The output will be placed in the `dist/` directory.
