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
  service            = each.key
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

locals {
  worker_base_url = trimsuffix(var.worker_base_url, "/")
}

resource "google_pubsub_topic" "gmail_push" {
  name       = var.gmail_push_topic_name
  depends_on = [google_project_service.required_apis]
}

resource "google_pubsub_topic_iam_member" "gmail_api_publisher" {
  topic  = google_pubsub_topic.gmail_push.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:gmail-api-push@system.gserviceaccount.com"
}

resource "google_pubsub_subscription" "gmail_push_worker" {
  name  = var.gmail_push_subscription_name
  topic = google_pubsub_topic.gmail_push.id

  ack_deadline_seconds = 30

  push_config {
    push_endpoint = "${local.worker_base_url}/internal/gmail-push"

    dynamic "oidc_token" {
      for_each = var.worker_invoker_service_account_email == null ? [] : [
        var.worker_invoker_service_account_email,
      ]

      content {
        audience              = local.worker_base_url
        service_account_email = oidc_token.value
      }
    }
  }

  retry_policy {
    maximum_backoff = "60s"
    minimum_backoff = "10s"
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_cloud_scheduler_job" "renew_gmail_watches" {
  name        = "mailmon-renew-gmail-watches"
  description = "Renews Gmail mailbox watches before expiration."
  schedule    = var.watch_renewal_schedule
  time_zone   = var.watch_renewal_time_zone

  http_target {
    uri         = "${local.worker_base_url}/internal/control-jobs"
    http_method = "POST"
    body        = base64encode(jsonencode({ kind = "renew_watches" }))

    headers = {
      "Content-Type" = "application/json"
    }

    dynamic "oidc_token" {
      for_each = var.worker_invoker_service_account_email == null ? [] : [
        var.worker_invoker_service_account_email,
      ]

      content {
        audience              = local.worker_base_url
        service_account_email = oidc_token.value
      }
    }
  }

  depends_on = [google_project_service.required_apis]
}

output "gmail_pubsub_topic_name" {
  description = "Full Gmail Pub/Sub topic resource name for MAILMON_GMAIL_PUBSUB_TOPIC_NAME."
  value       = google_pubsub_topic.gmail_push.id
}
