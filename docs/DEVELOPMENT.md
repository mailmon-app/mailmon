# Development Guide

## Prerequisites

- Node.js 22+
- pnpm 10.32.1
- Docker and Docker Compose
- Gmail OAuth credentials (optional, for real Gmail testing)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start local infrastructure (PostgreSQL, etc.)
pnpm docker:up

# Generate and run database migrations
pnpm db:generate
pnpm db:migrate

# Start API and worker in development mode
pnpm dev
```

Default local URLs:

- API: `http://127.0.0.1:3000`
- Worker: `http://127.0.0.1:3001`

## Development Commands

### Package Management

```bash
pnpm install              # Install all dependencies
pnpm install <pkg>        # Add a new dependency
pnpm update               # Update dependencies
```

### Database

```bash
pnpm db:generate          # Generate migrations from schema changes
pnpm db:migrate           # Run pending migrations
pnpm db:push              # Push schema directly (dev only)
```

### Running Services

```bash
pnpm dev                  # Run API and worker together
pnpm dev:api              # Run API only
pnpm dev:worker           # Run worker only
pnpm docker:up            # Start local containers
pnpm docker:down          # Stop local containers
```

### Building & Bundling

```bash
pnpm build                # Build all packages
pnpm build --filter <pkg> # Build a specific package
```

### Testing

```bash
pnpm test                 # Run all tests
pnpm test:watch           # Run tests in watch mode
pnpm test:coverage        # Run tests with coverage report
```

### Code Quality

```bash
pnpm lint                 # Run linter (oxlint)
pnpm lint:fix             # Auto-fix linting issues
pnpm format               # Format code (oxfmt)
pnpm format:check         # Check if code is formatted
pnpm typecheck            # Run TypeScript type checking
```

## Environment Variables

Create a `.env` file in the root:

```bash
NODE_ENV=development
DATABASE_URL=postgres://mailmon:mailmon@127.0.0.1:5432/mailmon
MAILMON_ASYNC_TRANSPORT_MODE=local
MAILMON_WORKER_BASE_URL=http://127.0.0.1:3001

# Generate a 32-byte base64 encryption key
MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY=<your-key>
MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY_ID=primary

# For real Gmail OAuth testing
MAILMON_GMAIL_OAUTH_CLIENT_ID=<your-client-id>
MAILMON_GMAIL_OAUTH_CLIENT_SECRET=<your-client-secret>
```

Generate a local encryption key:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

## Operator CLI

The CLI is located in `apps/cli` and provides operator commands for local development and infrastructure operations.

### Workspace Management

```bash
pnpm --filter @mailmon/cli dev -- admin workspace create
```

### API Keys

```bash
pnpm --filter @mailmon/cli dev -- admin keys create --workspace-id <workspace-id>
```

### Mailbox Operations

```bash
# Run a sync for a specific mailbox
pnpm --filter @mailmon/cli dev -- sync-mailbox <mailbox-id>

# Run a control job
pnpm --filter @mailmon/cli dev -- control-job recover_stuck_syncs
pnpm --filter @mailmon/cli dev -- control-job recover_webhook_deliveries
```

### Gmail Credentials

```bash
# Audit persisted Gmail credential envelopes
pnpm --filter @mailmon/cli dev -- gmail-credentials audit

# Rewrap credentials with the current encryption key
pnpm --filter @mailmon/cli dev -- gmail-credentials rewrap
```

### Webhook Testing

```bash
# Forward webhook deliveries to a local app
pnpm --filter @mailmon/cli dev -- listen \
  --forward-to http://localhost:4000/webhooks/mailmon

# Replay stored events into a local endpoint
pnpm --filter @mailmon/cli dev -- replay \
  --mailbox <mailbox-id> \
  --last 1h \
  --forward-to http://localhost:4000/webhooks/mailmon
```

## Project Structure

```
mailmon-dev/
├── apps/
│   ├── api/           # Hono-based public HTTP API
│   ├── worker/        # Sync, Gmail push, webhook delivery, control jobs
│   ├── cli/           # Local dev and operator commands
│   └── docs/          # Mintlify documentation site
│
├── packages/
│   ├── core/          # Domain contracts, use cases, Effect service interfaces
│   ├── db/            # Drizzle schema, persistence adapters, migrations
│   ├── gmail/         # Gmail OAuth, sync provider, token crypto
│   ├── queue/         # Local dispatch, Pub/Sub, Cloud Tasks adapters
│   └── config/        # Shared configuration and runtime modes
│
├── infra/             # Terraform for GCP infrastructure
├── docs/              # Documentation
├── plans/             # Architecture and implementation plans
└── docker-compose.yml # Local services definition
```

## Architecture & Design

- **Mailbox is the unit of work:** All state is mailbox-scoped. No account-scoped queues or workflows.
- **Effect service interfaces:** Transport-neutral contracts allow the same workflow to run locally or on GCP.
- **Transactional state commits:** Sync finalization, cursor advancement, events, and lease release happen atomically.
- **Durable event log:** All mailbox changes are recorded as immutable events in the database.
- **Database-backed leases:** Only one sync executes per mailbox at a time, coordinated through the database.

## Debugging

### Enable detailed logging

```bash
DEBUG=mailmon:* pnpm dev
```

### Inspect database state

```bash
# Connect to local Postgres
psql postgres://mailmon:mailmon@127.0.0.1:5432/mailmon

# View recent sync runs
SELECT * FROM sync_runs ORDER BY created_at DESC LIMIT 10;

# View mailbox events
SELECT * FROM mailbox_events ORDER BY created_at DESC LIMIT 20;

# Check mailbox leases
SELECT * FROM mailbox_leases;
```

### Test a specific endpoint

```bash
curl -X POST http://127.0.0.1:3000/v1/mailboxes/connect-sessions \
  -H "authorization: Bearer $MAILMON_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "provider": "gmail",
    "tenantExternalId": "tenant_demo",
    "mailboxExternalId": "primary",
    "redirectUrl": "http://localhost:3000/connected"
  }'
```

## Testing Strategies

### Unit Tests

Tests live alongside source code in `__tests__` directories:

```bash
pnpm test --run packages/core
```

### Integration Tests

Worker and API integration tests verify real workflows:

```bash
pnpm test --run apps/worker
pnpm test --run apps/api
```

### Watch Mode for Development

```bash
pnpm test:watch --filter @mailmon/core
```

## Common Tasks

### Adding a New Package

1. Create directory in `packages/` or `apps/`
2. Initialize `package.json` with name and dependencies
3. Add to `pnpm-workspace.yaml` if needed
4. Run `pnpm install` to link workspaces

### Modifying the Database Schema

1. Edit schema in `packages/db/src/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Review the generated SQL in `packages/db/src/migrations/`
4. Run migration: `pnpm db:migrate`

### Adding a New API Endpoint

1. Define the route in `apps/api/src/routes/`
2. Implement the handler using core use cases
3. Add tests in `apps/api/src/__tests__/`
4. Update API examples in README if user-facing

### Deploying to Staging/Production

Infrastructure is managed by Terraform in `infra/`:

```bash
cd infra
terraform plan
terraform apply
```

## Effect Best Practices

Always consult `effect-solutions` before writing Effect code:

```bash
pnpm exec effect-solutions list
pnpm exec effect-solutions show services-and-layers
```

Key patterns for this project:

- **Layers:** Service dependencies are wired through Effect layers in app runtimes
- **Transport-neutral workflows:** Core use cases compose Effect programs without importing HTTP/queue/DB adapters
- **Error handling:** Use structured Problem envelopes for API errors, Last Error for resource degradation
- **Configuration:** Runtime modes (local/gcp) are modeled in Effect layers, not ad hoc env checks

## Performance & Monitoring

### Local Performance Testing

```bash
# Run with profiling
node --prof apps/api/dist/index.js
node --prof-process isolate-*.log | head -100
```

### Database Query Analysis

```bash
# Enable query logging
DATABASE_LOG_LEVEL=debug pnpm dev
```

## Troubleshooting

### "Cannot find module" errors

```bash
# Clear build caches
rm -rf packages/*/dist apps/*/dist

# Rebuild
pnpm build
```

### Database connection issues

```bash
# Verify Docker containers are running
docker-compose ps

# Check connection string
echo $DATABASE_URL

# Test with psql
psql $DATABASE_URL
```

### Stale TypeScript definitions

```bash
# Clear tsbuildinfo files
find . -name ".tsbuildinfo" -delete

# Rebuild
pnpm build
```

## Resources

- **PRD:** [docs/PRD.md](PRD.md) - Product requirements and roadmap
- **Architecture Plan:** [plans/mailmon-gmail-sync-infrastructure.md](../plans/mailmon-gmail-sync-infrastructure.md)
- **Domain Language:** [UBIQUITOUS_LANGUAGE.md](../UBIQUITOUS_LANGUAGE.md)
- **ADRs:** [docs/adr/](adr/) - Architecture decision records
- **Effect Documentation:** [Effect Docs](https://effect.website)
