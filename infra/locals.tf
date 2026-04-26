locals {
  api_service_name       = "${var.name_prefix}-api"
  artifact_repository_id = "${var.name_prefix}-containers"
  database_name          = replace("${var.name_prefix}_${var.environment}", "-", "_")
  database_url_secret_id = "${var.name_prefix}-database-url"
  migrations_job_name    = "${var.name_prefix}-migrations"
  worker_service_name    = "${var.name_prefix}-worker"

  labels = merge(var.labels, {
    app         = "mailmon"
    environment = var.environment
    managed_by  = "terraform"
  })

  migrations_image = coalesce(var.migrations_image, var.api_image)

  required_api_services = toset([
    "cloudresourcemanager.googleapis.com",
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudkms.googleapis.com",
    "sqladmin.googleapis.com",
    "pubsub.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "iam.googleapis.com",
  ])

  worker_base_url = trimsuffix(var.worker_base_url, "/")
}
