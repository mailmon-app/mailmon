# Deployment Progress Tracking

This file tracks the status of the first-time deployment and records technical adjustments made to the infrastructure code.

## 🏁 Phase 1: Infrastructure Initialization (COMPLETED)

The base infrastructure has been successfully provisioned using OpenTofu.

### ✅ Accomplishments:

- Created GCS bucket for Terraform state.
- Initialized and applied infrastructure with dummy values.
- Successfully provisioned:
  - Cloud SQL (PostgreSQL 16, Enterprise Edition).
  - Cloud Run Services (API & Worker) using placeholder images.
  - Cloud Run Job (Migrations).
  - Secret Manager "containers" for credentials.
  - KMS Key Ring and Crypto Keys.
  - Pub/Sub Topic and Subscription for Gmail push notifications.
  - Workload Identity Federation (WIF) for GitHub Actions.

### 🛠 Technical Fixes Applied:

- **Cloud SQL Edition:** Set to `ENTERPRISE` explicitly to support the custom machine tier.
- **Reserved Env Vars:** Removed manual `PORT` environment variables (Cloud Run sets these automatically).
- **Secret Race Conditions:** Switched to explicit version IDs during initialization to ensure resources could find their secrets.
- **Secret Manager Identity:** Added `google_project_service_identity` to ensure the service agent exists before granting KMS permissions.
- **WIF Security:** Added an `attribute_condition` to the Workload Identity Provider to restrict access to the `mailmon-app/mailmon` repository.

---

## 🔑 Phase 2: Populating Secrets (COMPLETED)

Secrets have been manually updated in Secret Manager using `gcloud`.

- [x] Gmail OAuth Client ID
- [x] Gmail OAuth Client Secret
- [x] Gmail Refresh Token Encryption Key

---

## 🛠 Phase 3: GitHub Configuration (COMPLETED)

Repository secrets must be configured in GitHub **Settings > Secrets and variables > Actions**.

| Secret Name               | Value                                                                                                                |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`          | `mailmon-dev-494511`                                                                                                 |
| `DATABASE_PASSWORD`       | (The one used in Phase 1)                                                                                            |
| `WORKER_BASE_URL`         | `https://mailmon-worker-nsi5aiqucq-uc.a.run.app`                                                                     |
| `GCP_WIF_PROVIDER`        | `projects/906120705385/locations/global/workloadIdentityPools/mailmon-github-pool/providers/mailmon-github-provider` |
| `GCP_WIF_SERVICE_ACCOUNT` | `mailmon-github-deployer@mailmon-dev-494511.iam.gserviceaccount.com`                                                 |

---

## 🚀 Phase 4: The Final Push (IN PROGRESS)

- [x] Commit infrastructure changes (`infra/wif.tf`, `infra/variables.tf`, etc.)
- [x] Push to `main` branch to trigger the CI/CD pipeline.
- [ ] Debugging migration failure:
  - [x] Fixed `turbo.json` to include `DATABASE_URL` and `NODE_ENV` in `globalPassThroughEnv` (Turbo 2.0+ filters env vars by default).
  - [x] Updated `infra/main.tf` to use a more robust `DATABASE_URL` format for unix sockets (`@localhost/` instead of `@/`).
  - [x] Enabled `verbose` and `strict` mode in `packages/db/drizzle.config.ts` for better debugging.
