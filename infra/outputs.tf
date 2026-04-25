output "api_service_account_email" {
  description = "Service account email used by the API Cloud Run service."
  value       = google_service_account.api.email
}

output "api_service_url" {
  description = "Cloud Run URL for the API service."
  value       = google_cloud_run_v2_service.api.uri
}

output "artifact_registry_repository" {
  description = "Artifact Registry Docker repository for Mailmon images."
  value       = google_artifact_registry_repository.container.name
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name used by Cloud Run."
  value       = google_sql_database_instance.main.connection_name
}

output "cloud_tasks_queue_name" {
  description = "Cloud Tasks queue name for webhook deliveries."
  value       = google_cloud_tasks_queue.webhook_delivery.name
}

output "database_name" {
  description = "Cloud SQL database name."
  value       = google_sql_database.mailmon.name
}

output "database_url_secret_id" {
  description = "Secret Manager secret ID containing DATABASE_URL."
  value       = google_secret_manager_secret.database_url.secret_id
}

output "gmail_pubsub_topic_name" {
  description = "Full Gmail Pub/Sub topic resource name for MAILMON_GMAIL_PUBSUB_TOPIC_NAME."
  value       = google_pubsub_topic.gmail_push.id
}

output "gmail_oauth_client_id_secret_id" {
  description = "Secret Manager secret ID containing MAILMON_GMAIL_OAUTH_CLIENT_ID."
  value       = google_secret_manager_secret.gmail_oauth_client_id.secret_id
}

output "gmail_oauth_client_secret_secret_id" {
  description = "Secret Manager secret ID containing MAILMON_GMAIL_OAUTH_CLIENT_SECRET."
  value       = google_secret_manager_secret.gmail_oauth_client_secret.secret_id
}

output "gmail_push_subscription_name" {
  description = "Pub/Sub subscription name that pushes Gmail Push Notifications to the worker."
  value       = google_pubsub_subscription.gmail_push_worker.name
}

output "gmail_refresh_token_encryption_key_secret_id" {
  description = "Secret Manager secret ID containing MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY."
  value       = google_secret_manager_secret.gmail_refresh_token_encryption_key.secret_id
}

output "migrations_job_name" {
  description = "Cloud Run Job name used to run database migrations."
  value       = google_cloud_run_v2_job.migrations.name
}

output "worker_service_account_email" {
  description = "Service account email used by the worker Cloud Run service."
  value       = google_service_account.worker.email
}

output "worker_service_url" {
  description = "Cloud Run URL for the worker service."
  value       = google_cloud_run_v2_service.worker.uri
}
