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

**2. Database Connection String:**
The deployment pipeline stores the `DATABASE_URL` in GCP Secret Manager. Retrieve it using `gcloud`:

```bash
# Get the secret name from OpenTofu
SECRET_NAME=$(cd infra/ && tofu output -raw database_url_secret_id)

# Fetch the secret value
export DATABASE_URL=$(gcloud secrets versions access latest --secret="$SECRET_NAME")
```

### Requirements

- **Staging Database Connection String:** (`$DATABASE_URL`)
- **Staging API URL:** (`$API_URL`)
- **Staging Worker URL:** (`$WORKER_URL`)
- **GCP Project Access:** `gcloud` CLI authenticated and configured for the staging project (`mailmon-dev-494511`).
- **Webhook Receiver:** A publicly accessible URL to receive webhooks (e.g., `https://webhook.site/your-unique-id`).

### Provision Workspace and API Key

Since self-serve workspace management is not yet available in the API, use the Operator CLI to provision them against the staging database.

1. **Create a Workspace:**
   Run the CLI from your local Mailmon project root, pointing it to the staging database:

   ```bash
   DATABASE_URL="<your-staging-database-url>" pnpm --filter @mailmon/cli dev -- admin workspace create --workspace-id ws_staging_test
   ```

2. **Create an API Key:**
   Generate an API key for the new workspace:
   ```bash
   DATABASE_URL="<your-staging-database-url>" pnpm --filter @mailmon/cli dev -- admin keys create --workspace-id ws_staging_test --prefix mm_test_
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

2. **Subscribe to Mailbox Events:**
   Link the webhook endpoint to the mailbox you connected.

   ```bash
   curl -s -X POST "$API_URL/v1/webhook-endpoints/$ENDPOINT_ID/subscriptions" \
     -H "Authorization: Bearer $MAILMON_API_KEY" \
     -H "Content-Type: application/json" \
     -d "{\"mailboxId\": \"$MAILBOX_ID\"}"
   ```

3. **Trigger a Mailbox Event:**
   Send an email to the test Gmail account you just connected to trigger a new message event.

4. **Observe Cloud Tasks:**
   Check the GCP Cloud Tasks queue to see if a delivery task was scheduled and executed.

   ```bash
   gcloud tasks queues describe mailmon-webhook-deliveries --location <your-gcp-region>
   ```

5. **Verify Delivery at Receiver:**
   Check your webhook receiver site (`webhook.site`). You should see an incoming HTTP POST request containing the `message.created` Mailbox Event JSON payload.

6. **Verify Worker Logs:**
   In the GCP Logs Explorer, query the worker service logs to confirm the delivery request arrived from Cloud Tasks with a `200 OK`.
   ```text
   resource.type="cloud_run_revision"
   resource.labels.service_name="mailmon-worker"
   httpRequest.requestUrl=~"/internal/webhook-deliveries"
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

### Troubleshooting Auth Failures

If you encounter `401 Unauthorized` or `403 Forbidden` errors on the internal worker endpoints during these validations:

- Confirm the Worker's `MAILMON_ASYNC_TRANSPORT_MODE` environment variable is exactly `gcp`.
- Ensure the Service Account attached to the Cloud Tasks Queue or Pub/Sub Push Subscription matches the expected OIDC audience configured in the worker.
- Verify the Push Subscriptions and Cloud Tasks are explicitly configured to include an OIDC token in their requests.
