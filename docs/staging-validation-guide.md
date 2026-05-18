# Staging Validation Guide

This document outlines the exact, step-by-step procedures for live staging validation of the two immediate public-launch blockers:

1. **Webhook deliveries through Cloud Tasks**
2. **Gmail push/watch production path**

Both flows rely on GCP-native async transport mechanisms invoking internal HTTP endpoints on the `worker` service. In staging/production (`gcp` mode), these endpoints require Google OIDC authentication.

---

## 0. Prerequisites and Provisioning

Do not assume any existing state. You must provision a new workspace, API key, and connect a test Gmail account to validate the staging environment.

### Retrieving Configuration Values

Before you begin, you need the URLs for the deployed services and the database connection string. You can retrieve these using the `gcloud` CLI and `tofu` (OpenTofu) from the `infra/` directory.

**1. API and Worker URLs:**
Run the following in the `infra/` directory to get the deployed URLs:

```bash
cd infra/
export API_URL=$(tofu output -raw api_service_url)
export WORKER_URL=$(tofu output -raw worker_service_url)
cd ..
```

_(Alternatively, you can find these URLs in the GCP Cloud Run console)._

**2. Database Connection String (via Cloud SQL Proxy):**
The deployment pipeline stores the `DATABASE_URL` in GCP Secret Manager, but that connection string is designed for Cloud Run (`/cloudsql/...`) and will fail with `connect ENOENT` if used from your local machine.

To run the CLI commands locally against the staging database, you must use the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy).

1. Get the connection name from OpenTofu:
   ```bash
   cd infra/
   export INSTANCE_CONNECTION_NAME=$(tofu output -raw cloud_sql_connection_name)
   cd ..
   ```
2. In a separate terminal tab, start the proxy:
   ```bash
   cloud-sql-proxy $INSTANCE_CONNECTION_NAME --port 5433
   ```
3. Get the database connection string from Secret Manager and adapt it for the proxy:

   ```bash
   # Get the secret name from OpenTofu
   SECRET_NAME=$(cd infra/ && tofu output -raw database_url_secret_id)

   # Fetch the secret value (which has the Cloud Run unix socket path)
   CLOUD_RUN_DB_URL=$(gcloud secrets versions access latest --secret="$SECRET_NAME")

   # Modify it to connect to the local proxy port (5433) and strip the unix socket
   export DATABASE_URL=$(echo "$CLOUD_RUN_DB_URL" | sed 's|?host=.*||' | sed 's|@localhost/|@localhost:5433/|')
   ```

### Requirements

- **Staging Database Connection String:** (`$DATABASE_URL`)
- **Staging API URL:** (`$API_URL`)
- **Staging Worker URL:** (`$WORKER_URL`)
- **GCP Project Access:** `gcloud` CLI authenticated and configured for the staging project (`mailmon-dev-494511`).
- **Gmail API Enabled:** the staging GCP project must have `gmail.googleapis.com` enabled:
  ```bash
  gcloud services list --enabled \
    --filter='config.name:gmail.googleapis.com' \
    --format='value(config.name)'
  ```
  If this prints nothing, run:
  ```bash
  gcloud services enable gmail.googleapis.com
  ```
- **Google OAuth Redirect URI:** the OAuth client used by `MAILMON_GMAIL_OAUTH_CLIENT_ID` must list the staging API callback as an authorized redirect URI:
  ```bash
  printf "%s/oauth/gmail/callback\n" "${API_URL%/}"
  ```
  For Cloud Run staging this will look like `https://<api-service>.a.run.app/oauth/gmail/callback`.
- **Webhook Receiver:** A publicly accessible URL to receive webhooks (e.g., `https://webhook.site/your-unique-id`).

If Google shows `Error 400: redirect_uri_mismatch`, update the OAuth client in Google Cloud Console with the exact callback URI above, then create a fresh connect session. The `redirectUrl` in the connect-session request is the final customer redirect after Mailmon completes OAuth; it is not the Google OAuth callback.

### Provision Workspace and API Key

Since self-serve workspace management is not yet available in the API, use the Operator CLI to provision them against the staging database.

1. **Create a Workspace:**
   Run the CLI from your local Mailmon project root, pointing it to the staging database:

   ```bash
   DATABASE_URL=$DATABASE_URL pnpm --filter @mailmon.dev/cli dev -- admin workspace create --workspace-id ws_staging_test
   ```

2. **Create an API Key:**
   Generate an API key for the new workspace:
   ```bash
   DATABASE_URL=$DATABASE_URL pnpm --filter @mailmon.dev/cli dev -- admin keys create --workspace-id ws_staging_test --prefix mm_test_
   ```
   **Save the raw API key output**, as it will not be displayed again. Export it to your terminal:
   ```bash
   export MAILMON_API_KEY="<the-raw-api-key>"
   export API_URL="<your-staging-api-url>"
   ```

---

## 1. Connect a Test Mailbox

You need a connected Mailbox to generate events. Use the API to create a connect session and authorize a test Gmail account.

1. **Create a Connect Session:**

   ```bash
   curl -s -X POST "$API_URL/v1/mailboxes/connect-sessions" \
     -H "Authorization: Bearer $MAILMON_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "provider": "gmail",
       "tenantExternalId": "staging_validation",
       "mailboxExternalId": "test_account",
       "redirectUrl": "https://example.com/callback"
     }'
   ```

   _The response will contain a `connectUrl`._

2. **Authorize the Account:**
   - Copy the `connectUrl` from the JSON response and open it in your web browser.
   - Complete the Google OAuth consent screen using your test Gmail account.
   - After authorization, you will be redirected to `https://example.com/callback` (which will likely show a 404 in your browser, this is expected).

3. **Extract the Mailbox ID:**
   - Look at the URL in your browser's address bar after the redirect.
   - It will look like: `https://example.com/callback?status=success&mailbox_id=mbx_abc123...&created=true`
   - Copy the `mailbox_id` value and export it:
     ```bash
     export MAILBOX_ID="<your-mailbox-id>"
     ```

---

## 2. Validating Webhook Deliveries (Cloud Tasks)

**Goal:** Verify that a Mailbox Event triggers a Cloud Task, which then successfully authenticates and delivers the payload to the worker's `/internal/webhook-deliveries` endpoint, which in turn delivers to the customer's webhook URL.

### Step-by-Step Validation

1. **Register a Webhook Endpoint:**
   Point the API to your public test URL (e.g., a webhook.site URL).

   ```bash
   curl -s -X POST "$API_URL/v1/webhook-endpoints" \
     -H "Authorization: Bearer $MAILMON_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "<your-webhook-site-url>",
       "description": "Staging Validation"
     }'
   ```

   _Extract the `id` from the response and export it as `ENDPOINT_ID`._

   ```bash
   export ENDPOINT_ID="<the-endpoint-id>"
   ```

   Also save the receiver URL. If you lose it later, recover it from the staging database:

   ```bash
   pnpm --filter @mailmon/db exec tsx -e '
   import postgres from "postgres";
   void (async () => {
     const sql = postgres(process.env.DATABASE_URL!, { ssl: false });
     try {
       const rows = await sql`
         select id, url, delivery_state, last_delivery_at
         from webhook_endpoints
         where id = ${process.env.ENDPOINT_ID!}
       `;
       console.log(JSON.stringify(rows, null, 2));
     } finally {
       await sql.end();
     }
   })();
   '
   ```

2. **Subscribe to Mailbox Events:**
   Link the webhook endpoint to the mailbox you connected.

   ```bash
   curl -s -X POST "$API_URL/v1/webhook-endpoints/$ENDPOINT_ID/subscriptions" \
     -H "Authorization: Bearer $MAILMON_API_KEY" \
     -H "Content-Type: application/json" \
     -d "{
       \"mailboxIds\": [\"$MAILBOX_ID\"],
       \"eventTypes\": [\"message.created\", \"message.updated\", \"thread.updated\"]
     }"
   ```

3. **Trigger a Mailbox Event:**
   Send an email to the test Gmail account you just connected to trigger a new message event.
   Subscription creation does not enqueue a delivery by itself, and initial sync events that occurred before the subscription was created are not delivered to the new endpoint.

4. **Observe Cloud Tasks:**
   Check the GCP Cloud Tasks queue to see if a delivery task was scheduled and executed.

   ```bash
   gcloud tasks queues describe mailmon-webhook-deliveries --location <your-gcp-region>
   ```

   `gcloud tasks list` may show `0` tasks even when the system is healthy because tasks can be created and consumed quickly. Treat worker logs, receiver requests, and mailbox observability as stronger validation signals.

5. **Verify Delivery at Receiver:**
   Check your webhook receiver site (`webhook.site`). You should see an incoming HTTP POST request containing the `message.created` Mailbox Event JSON payload.

6. **Verify Worker Logs:**
   In the GCP Logs Explorer, query the worker service logs to confirm the delivery request arrived from Cloud Tasks with a `200 OK`.

   ```bash
   export SINCE="$(date -u -d '10 minutes ago' '+%Y-%m-%dT%H:%M:%SZ')"

   gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mailmon-worker\" AND timestamp>=\"$SINCE\" AND httpRequest.requestUrl=~\"/internal/webhook-deliveries\"" \
     --limit=100 \
     --format='table(timestamp,severity,httpRequest.status,httpRequest.requestUrl,textPayload,jsonPayload.message,jsonPayload.code,jsonPayload.detail)'
   ```

7. **Verify Mailbox Observability:**

   ```bash
   curl -s -X GET "$API_URL/v1/mailboxes/$MAILBOX_ID/observability" \
     -H "Authorization: Bearer $MAILMON_API_KEY" | jq
   ```

   Expected delivery state:

   ```text
   webhookDeliveries[0].deliveryState: healthy
   webhookDeliveries[0].pendingDeliveries: 0
   webhookDeliveries[0].failedDeliveries: 0
   webhookDeliveries[0].lastDeliveryAt: non-null and after the test event
   ```

---

## 3. Validating Gmail Push/Watch Path

**Goal:** Verify that changes in a connected Gmail account trigger a Google Pub/Sub notification, which is successfully authenticated and processed by the worker's `/internal/gmail-push` endpoint, leading to a mailbox sync dispatch.

### Step-by-Step Validation

1. **Verify Watch Status:**
   Ensure the test mailbox successfully established an active watch during the initial connect flow.

   ```bash
   curl -s -X GET "$API_URL/v1/mailboxes/$MAILBOX_ID/observability" \
     -H "Authorization: Bearer $MAILMON_API_KEY"
   ```

   _The response should indicate the watch is active and show an expiration date._

2. **Trigger an External Event:**
   Log into the test Gmail account from the Gmail web interface and perform an action (e.g., mark an email as read, archive an email, or apply a label).

3. **Observe Pub/Sub Metrics:**
   Check the `gmail-push` topic and `gmail-push-worker` subscription in the GCP Console. You should see a spike in published messages and pushed messages corresponding to your action.

4. **Verify Worker Logs (Push Intake):**
   Check the GCP Logs Explorer for the worker service to confirm the Push Notification was received and OIDC validation passed.

   ```text
   resource.type="cloud_run_revision"
   resource.labels.service_name="mailmon-worker"
   httpRequest.requestUrl=~"/internal/gmail-push"
   ```

5. **Verify Sync Dispatch:**
   The `/internal/gmail-push` endpoint should publish a message to the sync dispatch topic, which triggers the worker's `/internal/sync` endpoint.

   ```text
   resource.type="cloud_run_revision"
   resource.labels.service_name="mailmon-worker"
   httpRequest.requestUrl=~"/internal/sync"
   ```

6. **Verify State Update:**
   If you marked a message as read, fetch the message via the Mailmon API to confirm the labels list no longer contains `UNREAD`.

   ```bash
   curl -s -X GET "$API_URL/v1/messages?mailboxId=$MAILBOX_ID" \
     -H "Authorization: Bearer $MAILMON_API_KEY"
   ```

7. **Verify Full Fresh-Event Path:**
   For a stronger end-to-end check, send a brand-new email to the connected Gmail mailbox. A real Gmail state change must exist before webhook delivery can occur.

   Then query the worker logs:

   ```bash
   export SINCE="$(date -u -d '10 minutes ago' '+%Y-%m-%dT%H:%M:%SZ')"

   gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mailmon-worker\" AND timestamp>=\"$SINCE\" AND (httpRequest.requestUrl=~\"/internal/gmail-push\" OR httpRequest.requestUrl=~\"/internal/sync\" OR httpRequest.requestUrl=~\"/internal/webhook-deliveries\")" \
     --limit=100 \
     --format='table(timestamp,severity,httpRequest.status,httpRequest.requestUrl,textPayload,jsonPayload.message,jsonPayload.code,jsonPayload.detail)'
   ```

   Expected sequence:

   ```text
   /internal/gmail-push          202
   /internal/sync                200
   /internal/webhook-deliveries  200
   ```

   If Gmail push does not arrive on its own, publish a synthetic wake-up after the real Gmail change exists:

   ```bash
   CURRENT_CURSOR="$(curl -s "$API_URL/v1/mailboxes/$MAILBOX_ID/observability" \
     -H "Authorization: Bearer $MAILMON_API_KEY" | jq -r '.cursor.currentCursor')"

   NEXT_HISTORY_ID=$((CURRENT_CURSOR + 1))

   gcloud pubsub topics publish projects/mailmon-dev-494511/topics/gmail-push \
     --message="{\"emailAddress\":\"<connected-gmail-address>\",\"historyId\":$NEXT_HISTORY_ID}"
   ```

   Synthetic Pub/Sub messages are only wake-ups. If no real Gmail history exists beyond the stored cursor, `/internal/gmail-push` and `/internal/sync` can succeed while `latestSyncRun.eventsEmitted` remains `0`, the cursor does not advance, and no webhook delivery is scheduled. That is expected for duplicate wake-ups.

   After the run, check observability:

   ```bash
   curl -s -X GET "$API_URL/v1/mailboxes/$MAILBOX_ID/observability" \
     -H "Authorization: Bearer $MAILMON_API_KEY" | jq
   ```

   Expected after a fresh Mailbox Event:

   ```text
   latestSyncRun.eventsEmitted: greater than 0
   cursor.currentCursor: advanced to the latest Gmail cursor
   webhookDeliveries[0].lastDeliveryAt: updated after the test event
   webhookDeliveries[0].pendingDeliveries: 0
   webhookDeliveries[0].deliveryState: healthy
   ```

### Troubleshooting Auth Failures

If you encounter `401 Unauthorized` or `403 Forbidden` errors on the internal worker endpoints during these validations:

- Confirm the Worker's `MAILMON_ASYNC_TRANSPORT_MODE` environment variable is exactly `gcp`.
- Ensure the Service Account attached to the Cloud Tasks Queue or Pub/Sub Push Subscription matches the expected OIDC audience configured in the worker.
- Verify the Push Subscriptions and Cloud Tasks are explicitly configured to include an OIDC token in their requests.

### Troubleshooting Webhook Delivery Scheduling

If `pendingDeliveries` is non-zero but no `/internal/webhook-deliveries` calls appear:

- Confirm the worker service account can enqueue to the Cloud Tasks queue.
- Confirm the worker service account has `roles/iam.serviceAccountUser` on the service account used in the Cloud Tasks OIDC token.
- Confirm the Cloud Tasks service agent has `roles/iam.serviceAccountTokenCreator` on that same OIDC service account.
- Deploy or restart a worker revision after IAM propagation. Startup recovery for durable pending/in-flight Webhook Deliveries runs when the worker starts.

Useful checks:

```bash
gcloud tasks queues get-iam-policy mailmon-webhook-deliveries \
  --location=us-central1

gcloud iam service-accounts get-iam-policy \
  mailmon-tasks@mailmon-dev-494511.iam.gserviceaccount.com

gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mailmon-worker" AND (textPayload:"recovered" OR textPayload:"failed to recover durable webhook deliveries" OR httpRequest.requestUrl=~"/internal/webhook-deliveries")' \
  --limit=100 \
  --format='table(timestamp,severity,httpRequest.status,httpRequest.requestUrl,textPayload,jsonPayload.message,jsonPayload.code,jsonPayload.detail)'
```

---

## 4. Validating Pub/Sub Sync Retry And Dead-Letter Handling

**Goal:** Verify that the deployed mailbox sync dispatch topic, push subscription, retry policy, dead-letter topic, and `/internal/sync-dead-letter` handler work together with synthetic data only.

This validation is manual/staging-only. Do not add it to PR-time CI.

### Prerequisites

- `gcloud` is authenticated for the staging project.
- `DATABASE_URL` points to staging through an approved access path, usually Cloud SQL Auth Proxy.
- The worker service is temporarily configured with:

  ```bash
  MAILMON_STAGING_PUBSUB_RETRY_SMOKE_MAILBOX_IDS=mbx_pubsub_retry_smoke_<run_id>
  ```

  Use the run ID form from the command below, replacing dashes with underscores. This fixture makes only that synthetic mailbox return a retryable `503` from `/internal/sync`.

### Run

```bash
export RUN_ID="$(date -u +%Y%m%d%H%M%S)"

pnpm build:libs
pnpm exec tsx scripts/staging-pubsub-retry-smoke.ts \
  --run-id "$RUN_ID" \
  --project-id "$GCP_PROJECT_ID" \
  --topic "$MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME" \
  --subscription "$MAILMON_SYNC_DISPATCH_PUBSUB_SUBSCRIPTION_NAME" \
  --dead-letter-subscription "$MAILMON_SYNC_DISPATCH_DEAD_LETTER_SUBSCRIPTION_NAME" \
  --worker-service mailmon-worker \
  --region "$GCP_REGION"
```

Expected final output includes `staging_pubsub_retry_smoke_passed`, the synthetic mailbox ID, the recorded `syncRunId`, and a cleanup command. The pass condition is durable DB state: a `dispatch_retry_exhausted` sync run and mailbox Last Error `mailbox_sync_dispatch_retry_exhausted`.

To require Cloud Logging evidence that the forced retry happened more than once, add:

```bash
--require-retry-log
```

### Cleanup

Run the cleanup command printed by the smoke script, or:

```bash
pnpm exec tsx scripts/staging-pubsub-retry-smoke.ts \
  --run-id "$RUN_ID" \
  --cleanup-only
```

Remove the synthetic mailbox ID from `MAILMON_STAGING_PUBSUB_RETRY_SMOKE_MAILBOX_IDS` after the validation window.
