resource "google_project_service" "required_api" {
  for_each = local.required_api_services

  service            = each.key
  disable_on_destroy = false
}

resource "google_project_service_identity" "secret_manager" {
  provider = google-beta
  project  = var.project_id
  service  = "secretmanager.googleapis.com"
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_artifact_registry_repository" "container" {
  depends_on = [google_project_service.required_api]

  location      = var.region
  repository_id = local.artifact_repository_id
  description   = "Mailmon container images for ${var.environment}."
  format        = "DOCKER"
  labels        = local.labels
}

resource "google_kms_key_ring" "main" {
  depends_on = [google_project_service.required_api]

  name     = "${var.name_prefix}-${var.environment}"
  location = var.region
}

resource "google_kms_crypto_key" "secret_manager" {
  name            = "${var.name_prefix}-secret-manager"
  key_ring        = google_kms_key_ring.main.id
  rotation_period = var.secret_manager_key_rotation_period

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account" "api" {
  depends_on = [google_project_service.required_api]

  account_id   = "${var.name_prefix}-api"
  display_name = "Mailmon API service"
}

resource "google_service_account" "worker" {
  depends_on = [google_project_service.required_api]

  account_id   = "${var.name_prefix}-worker"
  display_name = "Mailmon worker service"
}

resource "google_service_account" "scheduler" {
  depends_on = [google_project_service.required_api]

  account_id   = "${var.name_prefix}-scheduler"
  display_name = "Mailmon Cloud Scheduler invoker"
}

resource "google_service_account" "tasks" {
  depends_on = [google_project_service.required_api]

  account_id   = "${var.name_prefix}-tasks"
  display_name = "Mailmon Cloud Tasks invoker"
}

resource "google_sql_database_instance" "main" {
  depends_on = [google_project_service.required_api]

  name                = "${var.name_prefix}-${var.environment}-postgres"
  database_version    = var.database_version
  deletion_protection = var.database_deletion_protection
  region              = var.region

  settings {
    activation_policy = "ALWAYS"
    availability_type = var.database_availability_type
    disk_autoresize   = true
    disk_size         = var.database_disk_size_gb
    disk_type         = "PD_SSD"
    tier              = var.database_tier
    edition           = "ENTERPRISE"

    backup_configuration {
      enabled                        = true
      location                       = var.region
      point_in_time_recovery_enabled = true
      start_time                     = var.database_backup_start_time
      transaction_log_retention_days = var.database_transaction_log_retention_days

      backup_retention_settings {
        retained_backups = var.database_retained_backups
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    maintenance_window {
      day          = var.database_maintenance_day
      hour         = var.database_maintenance_hour
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled = true
    }
  }
}

resource "google_sql_database" "mailmon" {
  name     = local.database_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "mailmon" {
  name     = var.database_user
  instance = google_sql_database_instance.main.name
  password = var.database_password
}

resource "google_secret_manager_secret" "database_url" {
  depends_on = [
    google_project_service.required_api,
    google_kms_crypto_key_iam_member.secret_manager_encrypter_decrypter,
  ]

  secret_id = local.database_url_secret_id
  labels    = local.labels

  replication {
    user_managed {
      replicas {
        location = var.region

        customer_managed_encryption {
          kms_key_name = google_kms_crypto_key.secret_manager.id
        }
      }
    }
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id

  secret_data = format(
    "postgresql://%s:%s@localhost/%s?host=/cloudsql/%s",
    urlencode(google_sql_user.mailmon.name),
    urlencode(var.database_password),
    urlencode(google_sql_database.mailmon.name),
    google_sql_database_instance.main.connection_name,
  )
}

resource "google_secret_manager_secret_version" "gmail_oauth_client_id" {
  count = var.gmail_oauth_client_id == null ? 0 : 1

  secret      = google_secret_manager_secret.gmail_oauth_client_id.id
  secret_data = var.gmail_oauth_client_id
}

resource "google_secret_manager_secret_version" "gmail_oauth_client_secret" {
  count = var.gmail_oauth_client_secret == null ? 0 : 1

  secret      = google_secret_manager_secret.gmail_oauth_client_secret.id
  secret_data = var.gmail_oauth_client_secret
}

resource "google_secret_manager_secret_version" "gmail_refresh_token_encryption_key" {
  count = var.gmail_refresh_token_encryption_key == null ? 0 : 1

  secret      = google_secret_manager_secret.gmail_refresh_token_encryption_key.id
  secret_data = var.gmail_refresh_token_encryption_key
}

resource "google_secret_manager_secret" "gmail_oauth_client_id" {
  depends_on = [
    google_project_service.required_api,
    google_kms_crypto_key_iam_member.secret_manager_encrypter_decrypter,
  ]

  secret_id = "${var.name_prefix}-gmail-oauth-client-id"
  labels    = local.labels

  replication {
    user_managed {
      replicas {
        location = var.region

        customer_managed_encryption {
          kms_key_name = google_kms_crypto_key.secret_manager.id
        }
      }
    }
  }
}

resource "google_secret_manager_secret" "gmail_oauth_client_secret" {
  depends_on = [
    google_project_service.required_api,
    google_kms_crypto_key_iam_member.secret_manager_encrypter_decrypter,
  ]

  secret_id = "${var.name_prefix}-gmail-oauth-client-secret"
  labels    = local.labels

  replication {
    user_managed {
      replicas {
        location = var.region

        customer_managed_encryption {
          kms_key_name = google_kms_crypto_key.secret_manager.id
        }
      }
    }
  }
}

resource "google_secret_manager_secret" "gmail_refresh_token_encryption_key" {
  depends_on = [
    google_project_service.required_api,
    google_kms_crypto_key_iam_member.secret_manager_encrypter_decrypter,
  ]

  secret_id = "${var.name_prefix}-gmail-refresh-token-encryption-key"
  labels    = local.labels

  replication {
    user_managed {
      replicas {
        location = var.region

        customer_managed_encryption {
          kms_key_name = google_kms_crypto_key.secret_manager.id
        }
      }
    }
  }
}

resource "google_project_iam_member" "api_cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.api.member
}

resource "google_project_iam_member" "worker_cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.worker.member
}

resource "google_secret_manager_secret_iam_member" "api_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.api.member
}

resource "google_secret_manager_secret_iam_member" "api_gmail_oauth_client_id" {
  secret_id = google_secret_manager_secret.gmail_oauth_client_id.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.api.member
}

resource "google_secret_manager_secret_iam_member" "api_gmail_oauth_client_secret" {
  secret_id = google_secret_manager_secret.gmail_oauth_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.api.member
}

resource "google_secret_manager_secret_iam_member" "api_gmail_refresh_token_encryption_key" {
  secret_id = google_secret_manager_secret.gmail_refresh_token_encryption_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.api.member
}

resource "google_secret_manager_secret_iam_member" "worker_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.worker.member
}

resource "google_secret_manager_secret_iam_member" "worker_gmail_oauth_client_id" {
  secret_id = google_secret_manager_secret.gmail_oauth_client_id.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.worker.member
}

resource "google_secret_manager_secret_iam_member" "worker_gmail_oauth_client_secret" {
  secret_id = google_secret_manager_secret.gmail_oauth_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.worker.member
}

resource "google_secret_manager_secret_iam_member" "worker_gmail_refresh_token_encryption_key" {
  secret_id = google_secret_manager_secret.gmail_refresh_token_encryption_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.worker.member
}

resource "google_pubsub_topic" "gmail_push" {
  depends_on = [google_project_service.required_api]

  name   = var.gmail_push_topic_name
  labels = local.labels
}

resource "google_pubsub_topic_iam_member" "gmail_api_publisher" {
  topic  = google_pubsub_topic.gmail_push.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:gmail-api-push@system.gserviceaccount.com"
}

resource "google_cloud_tasks_queue" "webhook_delivery" {
  depends_on = [google_project_service.required_api]

  name     = var.webhook_delivery_queue_id
  location = var.region

  rate_limits {
    max_concurrent_dispatches = var.webhook_delivery_max_concurrent_dispatches
    max_dispatches_per_second = var.webhook_delivery_max_dispatches_per_second
  }

  retry_config {
    max_attempts       = var.webhook_delivery_max_attempts
    max_backoff        = var.webhook_delivery_max_backoff
    max_doublings      = 5
    min_backoff        = var.webhook_delivery_min_backoff
    max_retry_duration = var.webhook_delivery_max_retry_duration
  }
}

resource "google_cloud_tasks_queue_iam_member" "worker_webhook_delivery_enqueuer" {
  name     = google_cloud_tasks_queue.webhook_delivery.name
  location = google_cloud_tasks_queue.webhook_delivery.location
  role     = "roles/cloudtasks.enqueuer"
  member   = google_service_account.worker.member
}

resource "google_cloud_run_v2_service" "api" {
  depends_on = [
    google_project_iam_member.api_cloud_sql_client,
    google_secret_manager_secret_iam_member.api_database_url,
    google_secret_manager_secret_iam_member.api_gmail_oauth_client_id,
    google_secret_manager_secret_iam_member.api_gmail_oauth_client_secret,
    google_secret_manager_secret_iam_member.api_gmail_refresh_token_encryption_key,
  ]

  name                = local.api_service_name
  location            = var.region
  deletion_protection = false
  ingress             = var.api_ingress
  labels              = local.labels

  template {
    service_account                  = google_service_account.api.email
    timeout                          = var.api_request_timeout
    max_instance_request_concurrency = var.api_max_instance_request_concurrency

    scaling {
      max_instance_count = var.api_max_instance_count
      min_instance_count = var.api_min_instance_count
    }

    containers {
      image = var.api_image

      ports {
        container_port = 8080
      }

      env {
        name  = "NODE_ENV"
        value = var.node_env
      }

      env {
        name = "MAILMON_ASYNC_TRANSPORT_MODE"

        value = "gcp"
      }

      env {
        name  = "HOST"
        value = "0.0.0.0"
      }

      env {
        name  = "MAILMON_WORKER_BASE_URL"
        value = local.worker_base_url
      }

      env {
        name = "DATABASE_URL"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = google_secret_manager_secret_version.database_url.version
          }
        }
      }

      env {
        name = "MAILMON_GMAIL_OAUTH_CLIENT_ID"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gmail_oauth_client_id.secret_id
            version = var.gmail_oauth_client_id == null ? "latest" : google_secret_manager_secret_version.gmail_oauth_client_id[0].version
          }
        }
      }

      env {
        name = "MAILMON_GMAIL_OAUTH_CLIENT_SECRET"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gmail_oauth_client_secret.secret_id
            version = var.gmail_oauth_client_secret == null ? "latest" : google_secret_manager_secret_version.gmail_oauth_client_secret[0].version
          }
        }
      }

      env {
        name = "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gmail_refresh_token_encryption_key.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = var.api_cpu
          memory = var.api_memory
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    volumes {
      name = "cloudsql"

      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }
  }

  traffic {
    percent  = 100
    revision = var.api_traffic_revision_name
    type     = var.api_traffic_revision_name == null ? "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST" : "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"
  }
}

resource "google_cloud_run_v2_service" "worker" {
  depends_on = [
    google_cloud_tasks_queue_iam_member.worker_webhook_delivery_enqueuer,
    google_project_iam_member.worker_cloud_sql_client,
    google_secret_manager_secret_iam_member.worker_database_url,
    google_secret_manager_secret_iam_member.worker_gmail_oauth_client_id,
    google_secret_manager_secret_iam_member.worker_gmail_oauth_client_secret,
    google_secret_manager_secret_iam_member.worker_gmail_refresh_token_encryption_key,
  ]

  name                = local.worker_service_name
  location            = var.region
  deletion_protection = false
  ingress             = var.worker_ingress
  labels              = local.labels

  template {
    service_account                  = google_service_account.worker.email
    timeout                          = var.worker_request_timeout
    max_instance_request_concurrency = var.worker_max_instance_request_concurrency

    scaling {
      max_instance_count = var.worker_max_instance_count
      min_instance_count = var.worker_min_instance_count
    }

    containers {
      image = var.worker_image

      ports {
        container_port = 8080
      }

      env {
        name  = "NODE_ENV"
        value = var.node_env
      }

      env {
        name  = "HOST"
        value = "0.0.0.0"
      }

      env {
        name = "MAILMON_ASYNC_TRANSPORT_MODE"

        value = "gcp"
      }

      env {
        name  = "MAILMON_WORKER_BASE_URL"
        value = local.worker_base_url
      }

      env {
        name  = "MAILMON_GMAIL_PUBSUB_TOPIC_NAME"
        value = google_pubsub_topic.gmail_push.id
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GCP_REGION"
        value = var.region
      }

      env {
        name  = "MAILMON_GCP_WEBHOOK_DELIVERY_QUEUE_ID"
        value = google_cloud_tasks_queue.webhook_delivery.name
      }

      env {
        name  = "MAILMON_GCP_TASKS_SERVICE_ACCOUNT_EMAIL"
        value = google_service_account.tasks.email
      }

      env {
        name  = "MAILMON_GCP_TASKS_AUDIENCE"
        value = local.worker_base_url
      }

      env {
        name = "DATABASE_URL"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = google_secret_manager_secret_version.database_url.version
          }
        }
      }

      env {
        name = "MAILMON_GMAIL_OAUTH_CLIENT_ID"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gmail_oauth_client_id.secret_id
            version = var.gmail_oauth_client_id == null ? "latest" : google_secret_manager_secret_version.gmail_oauth_client_id[0].version
          }
        }
      }

      env {
        name = "MAILMON_GMAIL_OAUTH_CLIENT_SECRET"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gmail_oauth_client_secret.secret_id
            version = var.gmail_oauth_client_secret == null ? "latest" : google_secret_manager_secret_version.gmail_oauth_client_secret[0].version
          }
        }
      }

      env {
        name = "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gmail_refresh_token_encryption_key.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = var.worker_cpu
          memory = var.worker_memory
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    volumes {
      name = "cloudsql"

      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }
  }

  traffic {
    percent  = 100
    revision = var.worker_traffic_revision_name
    type     = var.worker_traffic_revision_name == null ? "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST" : "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"
  }
}

resource "google_cloud_run_v2_job" "migrations" {
  depends_on = [
    google_project_iam_member.api_cloud_sql_client,
    google_secret_manager_secret_iam_member.api_database_url,
  ]

  name                = local.migrations_job_name
  location            = var.region
  deletion_protection = false
  labels              = local.labels

  template {
    template {
      service_account = google_service_account.api.email
      max_retries     = 1
      timeout         = var.migrations_timeout

      containers {
        image   = local.migrations_image
        command = var.migrations_command
        args    = var.migrations_args

        env {
          name  = "NODE_ENV"
          value = var.node_env
        }

        env {
          name = "DATABASE_URL"

          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = google_secret_manager_secret_version.database_url.version
            }
          }
        }

        resources {
          limits = {
            cpu    = var.migrations_cpu
            memory = var.migrations_memory
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }

      volumes {
        name = "cloudsql"

        cloud_sql_instance {
          instances = [google_sql_database_instance.main.connection_name]
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "api_public_invoker" {
  count = var.allow_unauthenticated_api ? 1 : 0

  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "worker_scheduler_invoker" {
  name     = google_cloud_run_v2_service.worker.name
  location = google_cloud_run_v2_service.worker.location
  role     = "roles/run.invoker"
  member   = google_service_account.scheduler.member
}

resource "google_cloud_run_v2_service_iam_member" "worker_tasks_invoker" {
  name     = google_cloud_run_v2_service.worker.name
  location = google_cloud_run_v2_service.worker.location
  role     = "roles/run.invoker"
  member   = google_service_account.tasks.member
}

resource "google_service_account_iam_member" "pubsub_scheduler_oidc_token_creator" {
  service_account_id = google_service_account.scheduler.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_service_account_iam_member" "scheduler_oidc_token_creator" {
  service_account_id = google_service_account.scheduler.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
}

resource "google_service_account_iam_member" "tasks_oidc_token_creator" {
  service_account_id = google_service_account.tasks.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
}

resource "google_kms_crypto_key_iam_member" "secret_manager_encrypter_decrypter" {
  crypto_key_id = google_kms_crypto_key.secret_manager.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_project_service_identity.secret_manager.email}"
}

resource "google_pubsub_subscription" "gmail_push_worker" {
  depends_on = [google_project_service.required_api]

  name  = var.gmail_push_subscription_name
  topic = google_pubsub_topic.gmail_push.id

  ack_deadline_seconds       = 30
  message_retention_duration = var.gmail_push_message_retention_duration

  push_config {
    push_endpoint = "${local.worker_base_url}/internal/gmail-push"

    oidc_token {
      audience              = local.worker_base_url
      service_account_email = google_service_account.scheduler.email
    }
  }

  retry_policy {
    maximum_backoff = "60s"
    minimum_backoff = "10s"
  }
}

resource "google_cloud_scheduler_job" "renew_gmail_watches" {
  depends_on = [google_project_service.required_api]

  name        = "${var.name_prefix}-renew-gmail-watches"
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

    oidc_token {
      audience              = local.worker_base_url
      service_account_email = google_service_account.scheduler.email
    }
  }
}
