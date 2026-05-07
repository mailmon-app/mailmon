# Staging Validation Debugging Progress

Captured on 2026-05-07 during manual staging validation for project `mailmon-dev-494511`.

This is a debugging log for the staging validation run. It records what was observed, what was fixed, and what remains to validate. It is not a roadmap or replacement for `plans/mailmon-gmail-sync-infrastructure.md`.

## Current State

- Staging API URL: `https://mailmon-api-nsi5aiqucq-uc.a.run.app`
- Staging worker URL: `https://mailmon-worker-nsi5aiqucq-uc.a.run.app`
- Connected Mailbox: `mbx_4c681d1a-a4db-40bc-b281-859f73b3e5b5`
- Webhook Endpoint: `whe_7b92f861-5f80-4a21-8525-116a110abeeb`
- Webhook Subscription: `whsub_c968b867-c00b-4b5d-8ae2-69a25b7d1dbf`
- Mailbox watch is active.
- Gmail Push Notifications are reaching the worker.
- Mailbox sync dispatch now succeeds after the Gmail push decoder fix.
- Latest observed successful sync: `2026-05-07T06:14:55.386Z`.
- Current remaining blocker: existing webhook delivery rows are pending because worker startup recovery ran before the Cloud Tasks OIDC `actAs` IAM grant was available.

Latest observability snapshot showed:

```text
lastSuccessfulSyncAt: 2026-05-07T06:14:55.386Z
watchState: active
syncState: healthy
currentCursor: 5125
pendingDeliveries: 7
lastDeliveryAt: null
```

## Progress Made

### 1. Hosted Gmail OAuth Redirect

Initial failure:

```text
Error 400: redirect_uri_mismatch
```

Observed hosted connect redirect from the API:

```text
redirect_uri=https://mailmon-api-nsi5aiqucq-uc.a.run.app/oauth/gmail/callback
client_id=906120705385-550lai74pkhqukmcrc6tmd1fsm7piqd0.apps.googleusercontent.com
```

Cause:

- The Google OAuth client did not have the staging API callback URI registered.

Resolution:

- Added the exact staging callback URI to the OAuth client in Google Cloud Console.
- Updated `docs/staging-validation-guide.md` to document the required callback URI.

### 2. Gmail Profile Fetch 403

Next failure after OAuth consent:

```text
https://example.com/callback?code=gmail_profile_fetch_failed&detail=Fetching+the+Gmail+mailbox+profile+failed+with+HTTP+403.&status=error
```

Cause:

- `gmail.googleapis.com` was not enabled in project `mailmon-dev-494511`.

Resolution:

```bash
gcloud services enable gmail.googleapis.com
```

After enabling Gmail API and creating a fresh connect session, mailbox connection succeeded:

```text
created=true
mailbox_id=mbx_4c681d1a-a4db-40bc-b281-859f73b3e5b5
status=success
```

The staging guide now includes a Gmail API enabled prerequisite.

### 3. Webhook Subscription Request Shape

Subscription creation initially failed:

```json
{
  "code": "invalid_request",
  "detail": "Body must include mailboxIds/mailbox_ids and eventTypes/event_types arrays."
}
```

Cause:

- `docs/staging-validation-guide.md` used a stale singular body:

```json
{ "mailboxId": "..." }
```

Resolution:

- Updated the guide to use the current batch request shape:

```json
{
  "mailboxIds": ["mbx_..."],
  "eventTypes": ["message.created", "message.updated", "thread.updated"]
}
```

Subscription creation then succeeded.

### 4. Subscription Creation Does Not Enqueue Delivery

Observation:

- Cloud Tasks queue existed and was `RUNNING`.
- Worker logs showed no `/internal/webhook-deliveries` calls immediately after subscription creation.

Clarification:

- Creating a webhook subscription does not enqueue a delivery by itself.
- Initial sync events created before the subscription are not delivered to the new endpoint.
- A new Gmail change is required after subscription creation.

Resolution:

- Updated the staging guide to make this explicit.

### 5. Gmail Push Worker 400s

After triggering Gmail changes, Pub/Sub push requests reached the worker but returned `400` repeatedly:

```text
POST /internal/gmail-push -> 400
```

Debugging step:

- Created a temporary pull subscription on the Gmail push topic.
- Pulled a live Gmail notification.
- Deleted the temporary subscription afterward.

Live decoded Gmail payload:

```json
{
  "emailAddress": "mailmon.dev@gmail.com",
  "historyId": 5088
}
```

Cause:

- Gmail publishes `historyId` as a JSON number.
- `packages/core/src/internal-message-codec.ts` only accepted non-empty string `historyId`.
- The worker rejected valid live Gmail Push Notifications before dispatching sync.

Resolution:

- Updated the Gmail push decoder to accept `string | number` and normalize to string.
- Added regression coverage for numeric Gmail `historyId`.

Verification:

```bash
pnpm --filter @mailmon/core test -- internal-message-codec
pnpm --filter @mailmon/core typecheck
pnpm --filter @mailmon/worker typecheck
```

Results:

- Core focused tests passed.
- Core typecheck passed.
- Worker typecheck had 0 errors and 2 existing warnings in tests.

After redeploy, Gmail push and sync succeeded:

```text
/internal/gmail-push -> 202
/internal/sync -> 200
```

### 6. Webhook Delivery Scheduling Blocker

Current observation:

- Mailbox observability shows `pendingDeliveries: 7`.
- `gcloud tasks list --queue=mailmon-webhook-deliveries --location=us-central1` listed 0 tasks.
- Worker logs showed no `/internal/webhook-deliveries` calls.
- Worker environment includes the expected GCP scheduler settings:

```text
GCP_PROJECT_ID=mailmon-dev-494511
GCP_REGION=us-central1
MAILMON_GCP_WEBHOOK_DELIVERY_QUEUE_ID=mailmon-webhook-deliveries
MAILMON_GCP_TASKS_SERVICE_ACCOUNT_EMAIL=mailmon-tasks@mailmon-dev-494511.iam.gserviceaccount.com
MAILMON_GCP_TASKS_AUDIENCE=https://mailmon-worker-nsi5aiqucq-uc.a.run.app
MAILMON_WORKER_BASE_URL=https://mailmon-worker-nsi5aiqucq-uc.a.run.app
```

Likely cause:

- The worker service account can enqueue to Cloud Tasks, but it also needs permission to act as the service account used in the task OIDC token.
- Cloud Tasks `OidcToken.serviceAccountEmail` requires the caller creating the task to have `iam.serviceAccounts.actAs` on that service account.

Infra fix:

- `infra/main.tf` includes `google_service_account_iam_member.worker_tasks_service_account_user`, granting:

```text
member: serviceAccount:mailmon-worker@mailmon-dev-494511.iam.gserviceaccount.com
role: roles/iam.serviceAccountUser
service account: mailmon-tasks@mailmon-dev-494511.iam.gserviceaccount.com
```

Local validation:

```bash
tofu fmt -check infra/main.tf
tofu validate
```

Both passed.

Post-apply observation:

- The Terraform binding was applied and the worker was redeployed.
- Existing observability still shows `pendingDeliveries: 7`.
- Cloud Tasks still lists 0 queued tasks.
- Logs still show no `/internal/webhook-deliveries` calls.

This means the IAM fix alone has not yet proven delivery scheduling. The remaining question is whether worker startup recovery actually ran after redeploy.

Follow-up log inspection confirmed that worker startup recovery did run on revision `mailmon-worker-00029-qjg` and failed before the IAM grant was effective:

```text
2026-05-07T06:41:31.435081Z failed to recover durable webhook deliveries after worker startup (FiberFailure) Error: 7 PERMISSION_DENIED: The principal (user or service account) lacks IAM permission "iam.serviceAccounts.actAs" for the resource "mailmon-tasks@mailmon-dev-494511.iam.gserviceaccount.com" (or the resource may not exist).
```

Current live IAM checks show the required grants are now present:

```text
mailmon-worker has roles/cloudtasks.enqueuer on the mailmon-webhook-deliveries queue.
mailmon-worker has roles/iam.serviceAccountUser on mailmon-tasks.
Cloud Tasks service agent has roles/iam.serviceAccountTokenCreator on mailmon-tasks.
```

The remaining pending deliveries did not recover because the recovery path is one-shot at worker startup. A new worker revision or instance start after IAM propagation should re-run recovery. To prevent the same race in future Terraform applies, `infra/main.tf` now makes the worker Cloud Run service depend on `google_service_account_iam_member.worker_tasks_service_account_user`.

### 7. Worker Wake-up and Health Check Attempt

Cloud Run worker URL:

```text
https://mailmon-worker-nsi5aiqucq-uc.a.run.app
```

Direct health check attempts with a user-account identity token returned Google Frontend HTML `404`.

Important detail:

- `gcloud auth print-identity-token --audiences="$WORKER_URL"` failed because the active credential is a user account, and `--audiences` requires a service account credential.
- The subsequent `curl` commands therefore did not include a valid audience-bound token.
- The `404` output should not be treated as proof that the worker app lacks `/health`.

Cloud Run proxy was then installed and started:

```bash
gcloud run services proxy mailmon-worker \
  --region=us-central1 \
  --port=8081
```

The proxy reported:

```text
http://127.0.0.1:8081 proxies to https://mailmon-worker-nsi5aiqucq-uc.a.run.app
```

But:

```bash
curl -i http://127.0.0.1:8081/health
```

still returned Google Frontend HTML `404`.

Updated interpretation:

- The worker service is configured with `worker_ingress = INGRESS_TRAFFIC_INTERNAL_ONLY`.
- The public Cloud Run URL/proxy health check is not a reliable wake-up path for this worker deployment.
- Do not change ingress just for this staging validation.
- Pub/Sub push is the correct wake-up path because the Pub/Sub service account already has permission to invoke the internal worker endpoint.

### 8. Synthetic Pub/Sub Wake-up

Published a synthetic Gmail Push Notification to the existing Gmail push topic:

```bash
TOPIC=$(tofu output -raw gmail_pubsub_topic_name)

gcloud pubsub topics publish "$TOPIC" \
  --message='{"emailAddress":"mailmon.dev@gmail.com","historyId":5126}'
```

Publish succeeded:

```text
messageIds:
- '19478590617535177'
```

Worker logs showed the expected push and sync path:

```text
2026-05-07T16:38:26.748959Z  /internal/gmail-push  202
2026-05-07T16:38:28.180791Z  /internal/sync        200
```

Mailbox observability after the synthetic push:

```text
lastSuccessfulSyncAt: 2026-05-07T16:38:28.565Z
currentCursor: 5128
previousCursor: 5125
nextCursor: 5128
cursorAdvanced: true
eventsEmitted: 0
pendingDeliveries: 7
lastDeliveryAt: null
```

Interpretation:

- Pub/Sub can wake the worker.
- `/internal/gmail-push` and `/internal/sync` are healthy after the numeric `historyId` decoder fix.
- The synthetic push advanced the Gmail cursor but emitted no Mailbox Events.
- Because `eventsEmitted` was `0`, this did not exercise active webhook delivery scheduling.
- The old `pendingDeliveries: 7` remain unrecovered, so startup recovery for existing durable deliveries is still unproven.

## Next Steps

First, start a fresh worker revision or instance after the IAM grant is present so startup recovery can re-arm the existing `pending` deliveries. Then trigger a real Gmail event, preferably by sending a brand-new email to the connected test mailbox. A synthetic Gmail push can prove dispatch liveness, but it cannot validate webhook delivery unless the sync emits at least one Mailbox Event.

After the real event, verify sync and webhook delivery:

```bash
gcloud logging read '
resource.type="cloud_run_revision"
resource.labels.service_name="mailmon-worker"
timestamp>="2026-05-07T16:38:00Z"
(
  textPayload:"recovered"
  OR textPayload:"failed to recover"
  OR httpRequest.requestUrl=~"/internal/gmail-push"
  OR httpRequest.requestUrl=~"/internal/sync"
  OR httpRequest.requestUrl=~"/internal/webhook-deliveries"
)
' \
  --limit=100 \
  --format='table(timestamp,severity,httpRequest.status,httpRequest.requestUrl,textPayload,jsonPayload.message,jsonPayload.code,jsonPayload.detail)'
```

Check Cloud Tasks:

```bash
gcloud tasks list \
  --queue=mailmon-webhook-deliveries \
  --location=us-central1 \
  --limit=20
```

Cloud Tasks may list `0` if tasks are created and consumed quickly. Treat `/internal/webhook-deliveries` logs and mailbox observability as the stronger validation signals.

Check mailbox observability:

```bash
curl -s -X GET "$API_URL/v1/mailboxes/$MAILBOX_ID/observability" \
  -H "Authorization: Bearer $MAILMON_API_KEY"
```

Expected final validation state:

- `/internal/webhook-deliveries` receives Cloud Tasks requests.
- Webhook receiver gets POST payloads.
- `pendingDeliveries` drops to `0`.
- `lastDeliveryAt` becomes non-null.
- Webhook endpoint remains `healthy`.
