locals {
  required_api_services = toset([
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "pubsub.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
  ])
  worker_base_url = trimsuffix(var.worker_base_url, "/")
}
