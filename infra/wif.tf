resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${var.name_prefix}-github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Identity pool for GitHub Actions deployment"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "${var.name_prefix}-github-provider"
  display_name                       = "GitHub Actions Provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "github_deployer" {
  account_id   = "${var.name_prefix}-github-deployer"
  display_name = "GitHub Actions Deployer"
}

resource "google_service_account_iam_member" "github_deployer_wif_impersonation" {
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Permissions for the deployer to manage the infrastructure
resource "google_project_iam_member" "deployer_editor" {
  project = var.project_id
  role    = "roles/editor"
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}

# Additionally, Cloud Run needs specific IAM permissions that Editor doesn't always cover smoothly in Tofu/Terraform
resource "google_project_iam_member" "deployer_iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}

# OpenTofu manages IAM bindings on Pub/Sub topics and Cloud Tasks queues. Those
# resource-level IAM updates require service-specific getIamPolicy/setIamPolicy
# permissions in addition to general infrastructure editing permissions.
resource "google_project_iam_member" "deployer_pubsub_editor" {
  project = var.project_id
  role    = "roles/pubsub.editor"
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}

resource "google_project_iam_member" "deployer_cloud_tasks_queue_admin" {
  project = var.project_id
  role    = "roles/cloudtasks.queueAdmin"
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}
