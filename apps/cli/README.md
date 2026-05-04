# @mailmon.dev/cli

The official CLI for Mailmon operators and developers. It provides back-office commands for managing workspaces, API keys, sync jobs, and event webhooks.

## Installation

You can run the CLI directly using `npx`:

```bash
npx @mailmon.dev/cli <command>
```

Or install it globally:

```bash
npm install -g @mailmon.dev/cli
```

## Commands

### `listen`

Listen for local webhook deliveries and optionally forward them to a local application endpoint.

```bash
mailmon listen --forward-to http://localhost:4000/webhooks/mailmon
```

### `replay`

Replay stored mailbox events into a local HTTP endpoint. Useful for testing webhook processing logic against historical data.

```bash
mailmon replay --mailbox <mailbox-id> --last 1h --forward-to http://localhost:4000/webhooks/mailmon
```

### `sync-mailbox`

Manually dispatch a mailbox sync through the worker runtime.

```bash
mailmon sync-mailbox <mailbox-id>
```

### `control-job`

Trigger a background control job.

Supported job kinds:

- `renew_watches`
- `dispatch_replays`
- `repair_mailboxes`
- `recover_stuck_syncs`
- `cleanup`

```bash
mailmon control-job recover_stuck_syncs
```

### `admin workspace`

Manage Mailmon workspaces.

- `create`: Create a new workspace.
  ```bash
  mailmon admin workspace create
  ```

### `admin keys`

Manage workspace API keys.

- `create`: Create a new workspace API key and output the raw key.
  ```bash
  mailmon admin keys create --workspace-id <workspace-id>
  ```
- `revoke`: Revoke an existing workspace API key.
  ```bash
  mailmon admin keys revoke --key-id <key-id>
  ```

### `gmail-credentials`

Operate on persisted Gmail refresh-token credential envelopes in the database. Requires `DATABASE_URL` and `MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY` environment variables.

- `audit`: Audit stored Gmail refresh-token credential envelopes.
  ```bash
  mailmon gmail-credentials audit
  ```
- `rewrap`: Re-encrypt Gmail refresh-token credentials with the active key.
  ```bash
  mailmon gmail-credentials rewrap
  ```

## Configuration

The CLI interacts with your Mailmon database and worker. Ensure the necessary environment variables are set (e.g., `DATABASE_URL`, `MAILMON_WORKER_BASE_URL`, `MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY`) in your environment or via a `.env` file when running commands.
