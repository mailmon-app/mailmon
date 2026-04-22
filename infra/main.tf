# Mailmon Infrastructure

# Enable required GCP APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "pubsub.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com"
  ])
  service = each.key
  disable_on_destroy = false
}

# Example Secret to test Varlock Integration
resource "google_secret_manager_secret" "example_secret" {
  secret_id = "mailmon-db-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required_apis]
}
