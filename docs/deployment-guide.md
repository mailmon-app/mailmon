# Mailmon Deployment Guide

This guide describes how to deploy Mailmon for private beta in GCP.
It matches the current runtime model in `packages/config`, `packages/queue`, `apps/api`, `apps/worker`, and `infra/`.

## Deployment model

Mailmon uses:

- Cloud Run for the API service and worker service
- Cloud SQL for PostgreSQL
- Cloud Tasks for webhook delivery scheduling
- Pub/Sub for Gmail Push Notifications
- Cloud Scheduler for watch renewal
- Secret Manager for runtime secrets
- Cloud KMS for Secret Manager customer-managed encryption
- Artifact Registry for container images

The mailbox is the unit of work.
Deploy the API and worker as a pair.
Do not treat Pub/Sub or Cloud Tasks as the source of truth.

## Prerequisites

Before you apply Terraform, you need:

- a GCP project for the target environment
- billing enabled
- a DNS or load-balancer plan for the worker base URL, if you do not want to expose the worker directly
- container images for `@mailmon/api` and `@mailmon/worker`
- the Gmail OAuth client ID and secret
- the Gmail refresh-token encryption key
- a database password for Cloud SQL

## Required inputs

The Terraform stack in `infra/` expects these key values:

- `project_id`
- `region`
- `environment`
- `api_image`
- `worker_image`
- `worker_base_url`
- `database_password`

Optional bootstrap secret values can also be passed in for first-time provisioning:

- `gmail_oauth_client_id`
- `gmail_oauth_client_secret`
- `gmail_refresh_token_encryption_key`

If you do not pass those optional values, populate the Secret Manager secrets out of band after Terraform creates them.

## Provisioning order

Use this order for a clean environment:

1. Build and push the API and worker images to Artifact Registry.
2. Apply Terraform in `infra/`.
3. Create or refresh the secret versions for Gmail OAuth and encryption material if you did not bootstrap them through Terraform.
4. Run the migration job.
5. Deploy the API service.
6. Deploy the worker service.
7. Verify Pub/Sub pushes, Cloud Tasks dispatch, and Cloud Scheduler calls.

The deployment should be treated as incomplete until the migration job has run successfully.

## Terraform apply

Run OpenTofu from `infra/`:

```bash
tofu init
tofu apply
```

The infrastructure layer creates:

- `google_cloud_run_v2_service.api`
- `google_cloud_run_v2_service.worker`
- `google_cloud_run_v2_job.migrations`
- `google_sql_database_instance.main`
- `google_cloud_tasks_queue.webhook_delivery`
- `google_pubsub_topic.gmail_push`
- `google_pubsub_subscription.gmail_push_worker`

Relevant outputs include:

- API and worker service URLs
- Cloud SQL connection name
- Artifact Registry repository
- Cloud Tasks queue name
- Secret IDs for runtime configuration

## Environment variables

The app runtime expects different values by service.

### API service

The API service runs with:

- `MAILMON_ASYNC_TRANSPORT_MODE=gcp`
- `MAILMON_WORKER_BASE_URL`
- `DATABASE_URL`
- `MAILMON_GMAIL_OAUTH_CLIENT_ID`
- `MAILMON_GMAIL_OAUTH_CLIENT_SECRET`
- `MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY`

### Worker service

The worker service runs with:

- `MAILMON_ASYNC_TRANSPORT_MODE=gcp`
- `MAILMON_WORKER_BASE_URL`
- `MAILMON_GMAIL_PUBSUB_TOPIC_NAME`
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `MAILMON_GCP_WEBHOOK_DELIVERY_QUEUE_ID`
- `MAILMON_GCP_TASKS_SERVICE_ACCOUNT_EMAIL`
- `MAILMON_GCP_TASKS_AUDIENCE`
- `DATABASE_URL`
- `MAILMON_GMAIL_OAUTH_CLIENT_ID`
- `MAILMON_GMAIL_OAUTH_CLIENT_SECRET`
- `MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY`

The worker base URL must be the externally reachable URL that Cloud Tasks, Pub/Sub, and Cloud Scheduler can call.

## Migration workflow

Run migrations before sending traffic to the new deployment.

Use the Cloud Run Job named by the `migrations_job_name` output.
The job runs `pnpm db:migrate` against the Cloud SQL instance using the shared `DATABASE_URL`.

If you add schema changes, the safe sequence is:

1. deploy code that can read the old schema and the new schema
2. run the migration job
3. deploy code that depends on the new schema shape

## Rollout path

For a normal release:

1. Push the new container images.
2. Apply Terraform.
3. Run migrations.
4. Update the API service revision.
5. Update the worker service revision.
6. Confirm `/health` on both services.
7. Send a Gmail Push Notification and confirm a mailbox sync starts.
8. Confirm webhook delivery tasks are being created.

## Rollback path

Rollback should be revision-based first.

If a release misbehaves:

1. Move Cloud Run traffic back to the previous known-good revision.
2. Keep the database schema if the newer schema is backward compatible.
3. If a schema rollback is required, restore from a database backup instead of trying to hand-edit production data.

The Terraform variables `api_traffic_revision_name` and `worker_traffic_revision_name` exist for explicit traffic pinning.
Use them when you need deterministic cutover or rollback.

## Backup and restore

Cloud SQL is configured with automated backups and point-in-time recovery.

Use backups for:

- accidental data loss
- failed migrations that cannot be fixed by traffic rollback
- recovery from destructive operational mistakes

Restore should be treated as a controlled operational procedure, not a normal deploy step.
Prefer a fresh recovery instance when you need to inspect a point-in-time restore before replacing the primary instance.

## Verification checklist

After deployment, confirm:

- the API responds on `/health`
- the worker responds on `/health`
- the API can create or read a mailbox
- the worker can accept `/internal/gmail-push`
- Cloud Tasks can reach `/internal/webhook-deliveries`
- Cloud Scheduler can reach `/internal/control-jobs`
- the Gmail Push Notification subscription is active
- the Cloud SQL connection is working
- webhook deliveries are being persisted from durable mailbox events

## Operational boundaries

Do not rely on local emulation for the private beta deployment path.
The goal of this stack is to match staging and production topology closely enough that rollout behavior is predictable.

Keep the following in mind:

- local development still uses local adapters for sync and delivery scheduling
- GCP deployment uses Cloud Tasks and Pub/Sub for runtime triggers
- the worker must be reachable from the worker base URL you provide
- secrets should live in Secret Manager rather than inline environment values
