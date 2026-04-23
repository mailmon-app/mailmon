resource "google_project_service" "required_api" {
  for_each = local.required_api_services

  service            = each.key
  disable_on_destroy = false
}

resource "google_secret_manager_secret" "example_secret" {
  depends_on = [google_project_service.required_api]

  secret_id = "mailmon-db-url"

  replication {
    auto {}
  }
}

resource "google_pubsub_topic" "gmail_push" {
  depends_on = [google_project_service.required_api]

  name = var.gmail_push_topic_name
}

resource "google_pubsub_topic_iam_member" "gmail_api_publisher" {
  topic  = google_pubsub_topic.gmail_push.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:gmail-api-push@system.gserviceaccount.com"
}

resource "google_pubsub_subscription" "gmail_push_worker" {
  depends_on = [google_project_service.required_api]

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
}

resource "google_cloud_scheduler_job" "renew_gmail_watches" {
  depends_on = [google_project_service.required_api]

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
}
