# First-Time Deployment Guide

This guide provides the exact sequence of steps required to initialize your GCP environment and trigger the automated CI/CD pipeline.

## Phase 1: Infrastructure Initialization

Before the pipeline can run, you must create the "containers" for your infrastructure and set up a place for Terraform to store its state.

### 1. Create a GCS Bucket for Terraform State

Terraform needs a remote bucket so that your local machine and GitHub Actions can share the same infrastructure state.

```bash
# Replace YOUR_PROJECT_ID with your actual GCP project ID
export PROJECT_ID="YOUR_PROJECT_ID"
export BUCKET_NAME="${PROJECT_ID}-terraform-state"

gcloud storage buckets create gs://${BUCKET_NAME} --project=${PROJECT_ID} --location=us-central1
```

### 2. Configure the Terraform Backend

Update `infra/terraform.tf` to use this new bucket.

**File: `infra/terraform.tf`**

```hcl
terraform {
  required_version = ">= 1.7"

  backend "gcs" {
    bucket = "YOUR_PROJECT_ID-terraform-state" # Replace with your bucket name
    prefix = "terraform/state"
  }
  # ... rest of file
}
```

### 3. Run the Initial "Empty" Apply

This step creates the Secret Manager containers and the Artifact Registry repository.

```bash
cd infra
tofu init
# Pass dummy values just to get the infrastructure created
tofu apply \
  -var="project_id=${PROJECT_ID}" \
  -var="database_password=initial-bootstrap-dummy" \
  -var="worker_base_url=https://pending-deployment.run.app" \
  -var="api_image=us-docker.pkg.dev/cloudrun/container/hello" \
  -var="worker_image=us-docker.pkg.dev/cloudrun/container/hello" \
  -var="gmail_oauth_client_id=dummy" \
  -var="gmail_oauth_client_secret=dummy" \
  -var="gmail_refresh_token_encryption_key=dummy"
```

---

## Phase 2: Populating Secrets

Now that the secret "containers" exist in GCP, you must add the actual values "out of band" so they are never committed to git.

### 1. Generate an Encryption Key

You need a 32-byte base64 key for encrypting Gmail refresh tokens.

```bash
openssl rand -base64 32
```

### 2. Add Secret Versions to GCP

Run these commands replacing the placeholder text with your actual keys. **Do not include newlines.**

```bash
# Gmail OAuth Client ID
echo -n "YOUR_OAUTH_CLIENT_ID" | gcloud secrets versions add mailmon-gmail-oauth-client-id --data-file=-

# Gmail OAuth Client Secret
echo -n "YOUR_OAUTH_CLIENT_SECRET" | gcloud secrets versions add mailmon-gmail-oauth-client-secret --data-file=-

# Gmail Refresh Token Encryption Key (The one you generated in step 1)
echo -n "YOUR_BASE64_KEY" | gcloud secrets versions add mailmon-gmail-refresh-token-encryption-key --data-file=-
```

---

## Phase 3: GitHub Configuration

The pipeline in `.github/workflows/ci.yml` requires several repository secrets to be set in your GitHub repo settings (**Settings > Secrets and variables > Actions**).

| Secret Name               | Value Description                                                                                                             |
| :------------------------ | :---------------------------------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`          | Your GCP Project ID                                                                                                           |
| `GCP_WIF_PROVIDER`        | The Workload Identity Provider ID (e.g., `projects/123/locations/global/workloadIdentityPools/my-pool/providers/my-provider`) |
| `GCP_WIF_SERVICE_ACCOUNT` | The service account email used for deployment                                                                                 |
| `DATABASE_PASSWORD`       | A strong password for the Cloud SQL instance                                                                                  |
| `WORKER_BASE_URL`         | The external URL where your worker will be reachable (e.g., `https://mailmon-worker-xyz.a.run.app`)                           |

_Note: If you haven't set up Workload Identity Federation yet, you can temporarily use a Service Account Key JSON in a secret named `GCP_SA_KEY` and update the `auth` step in `ci.yml`._

---

## Phase 4: The Final Push

Once Phase 1–3 are complete, you are ready to enable the automated cycle.

1.  **Commit your changes**:

    ```bash
    git add .
    git commit -m "chore: finalize deployment pipeline and docker configuration"
    ```

2.  **Push to main**:
    ```bash
    git push origin main
    ```

### What happens next?

The GitHub Action will:

1.  **Verify**: Run linting, type-checking, and tests.
2.  **Build**: Create Docker images for the API and Worker.
3.  **Push**: Upload images to GCP Artifact Registry.
4.  **Deploy Infra**: Run `tofu apply` to update Cloud Run with the new images.
5.  **Migrate**: Execute the Cloud Run Job to update your database schema.
6.  **Ready**: Your services will be live and reachable at the URLs provided by the Terraform outputs.
