variable "allow_unauthenticated_api" {
  description = "Whether to allow public unauthenticated invocation of the API Cloud Run service."
  type        = bool
  default     = true
}

variable "api_cpu" {
  description = "CPU limit for the API Cloud Run container."
  type        = string
  default     = "1"
}

variable "api_image" {
  description = "Fully qualified API container image to deploy."
  type        = string
}

variable "api_ingress" {
  description = "Ingress policy for the API Cloud Run service."
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"
}

variable "api_max_instance_count" {
  description = "Maximum API Cloud Run instances."
  type        = number
  default     = 10
}

variable "api_max_instance_request_concurrency" {
  description = "Maximum concurrent requests per API Cloud Run instance."
  type        = number
  default     = 80
}

variable "api_memory" {
  description = "Memory limit for the API Cloud Run container."
  type        = string
  default     = "1024Mi"
}

variable "api_min_instance_count" {
  description = "Minimum API Cloud Run instances."
  type        = number
  default     = 0
}

variable "api_request_timeout" {
  description = "API Cloud Run request timeout."
  type        = string
  default     = "60s"
}

variable "api_traffic_revision_name" {
  description = "Optional API Cloud Run revision name to receive 100% traffic. Leave null to route to the latest ready revision."
  type        = string
  default     = null
  nullable    = true
}

variable "cloud_run_deletion_protection" {
  description = "Whether Cloud Run services and jobs should be protected from Terraform deletion."
  type        = bool
  default     = true
}

variable "database_availability_type" {
  description = "Cloud SQL availability type."
  type        = string
  default     = "ZONAL"
}

variable "database_backup_start_time" {
  description = "UTC time when automated Cloud SQL backups should start."
  type        = string
  default     = "03:00"
}

variable "database_deletion_protection" {
  description = "Whether the Cloud SQL instance should be protected from deletion."
  type        = bool
  default     = true
}

variable "database_disk_size_gb" {
  description = "Initial Cloud SQL disk size in GB."
  type        = number
  default     = 20
}

variable "database_maintenance_day" {
  description = "Cloud SQL maintenance window day, where 1 is Monday and 7 is Sunday."
  type        = number
  default     = 7
}

variable "database_maintenance_hour" {
  description = "Cloud SQL maintenance window hour in UTC."
  type        = number
  default     = 4
}

variable "database_password" {
  description = "Password for the Mailmon Cloud SQL database user. This is sensitive and will be stored in Terraform state."
  type        = string
  sensitive   = true
}

variable "database_retained_backups" {
  description = "Number of Cloud SQL automated backups to retain."
  type        = number
  default     = 14
}

variable "database_tier" {
  description = "Cloud SQL machine tier."
  type        = string
  default     = "db-custom-1-3840"
}

variable "database_transaction_log_retention_days" {
  description = "Number of days to retain Cloud SQL transaction logs for point-in-time recovery."
  type        = number
  default     = 7
}

variable "database_user" {
  description = "Cloud SQL database user used by Mailmon services."
  type        = string
  default     = "mailmon"
}

variable "database_version" {
  description = "Cloud SQL PostgreSQL version."
  type        = string
  default     = "POSTGRES_16"
}

variable "deployment_service_account_email" {
  description = "Optional service account email used by CI/CD to run OpenTofu. Defaults to the Terraform-managed GitHub deployer service account."
  type        = string
  default     = null
  nullable    = true
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "staging"
}

variable "gmail_push_message_retention_duration" {
  description = "How long Gmail Push Notification Pub/Sub messages are retained."
  type        = string
  default     = "86400s"
}

variable "gmail_push_subscription_name" {
  description = "Pub/Sub push subscription name for worker Gmail Push Notification intake."
  type        = string
  default     = "gmail-push-worker"
}

variable "gmail_push_topic_name" {
  description = "Pub/Sub topic name used for Gmail Push Notification watch registration."
  type        = string
  default     = "gmail-push"
}

variable "mailbox_sync_dispatch_dead_letter_topic_name" {
  description = "Pub/Sub dead-letter topic name for mailbox sync dispatch messages that exhaust retries."
  type        = string
  default     = "mailbox-sync-dispatch-dead-letter"
}

variable "mailbox_sync_dispatch_max_delivery_attempts" {
  description = "Maximum Pub/Sub delivery attempts before mailbox sync dispatch messages are dead-lettered."
  type        = number
  default     = 5

  validation {
    condition     = var.mailbox_sync_dispatch_max_delivery_attempts >= 5 && var.mailbox_sync_dispatch_max_delivery_attempts <= 100
    error_message = "mailbox_sync_dispatch_max_delivery_attempts must be between 5 and 100."
  }
}

variable "mailbox_sync_dispatch_message_retention_duration" {
  description = "How long mailbox sync dispatch Pub/Sub messages are retained."
  type        = string
  default     = "86400s"
}

variable "mailbox_sync_dispatch_subscription_name" {
  description = "Pub/Sub push subscription name for worker mailbox sync dispatch intake."
  type        = string
  default     = "mailbox-sync-dispatch-worker"
}

variable "mailbox_sync_dispatch_topic_name" {
  description = "Pub/Sub topic name used for durable mailbox sync dispatch."
  type        = string
  default     = "mailbox-sync-dispatch"
}

variable "gmail_oauth_client_id" {
  description = "Optional Gmail OAuth client ID secret value to bootstrap into Secret Manager. Leave null to populate the secret out of band."
  type        = string
  default     = null
  nullable    = true
  sensitive   = true

  validation {
    condition     = var.gmail_oauth_client_id == null || length(var.gmail_oauth_client_id) > 0
    error_message = "gmail_oauth_client_id must be null or a non-empty string."
  }
}

variable "gmail_oauth_client_secret" {
  description = "Optional Gmail OAuth client secret value to bootstrap into Secret Manager. Leave null to populate the secret out of band."
  type        = string
  default     = null
  nullable    = true
  sensitive   = true

  validation {
    condition     = var.gmail_oauth_client_secret == null || length(var.gmail_oauth_client_secret) > 0
    error_message = "gmail_oauth_client_secret must be null or a non-empty string."
  }
}

variable "gmail_refresh_token_encryption_key" {
  description = "Optional base64 Gmail refresh-token encryption key to bootstrap into Secret Manager. Leave null to populate the secret out of band."
  type        = string
  default     = null
  nullable    = true
  sensitive   = true

  validation {
    condition     = var.gmail_refresh_token_encryption_key == null || length(var.gmail_refresh_token_encryption_key) > 0
    error_message = "gmail_refresh_token_encryption_key must be null or a non-empty string."
  }
}

variable "labels" {
  description = "Additional labels to apply to supported resources."
  type        = map(string)
  default     = {}
}

variable "migrations_args" {
  description = "Arguments passed to the migration job command."
  type        = list(string)
  default     = ["db:migrate"]
}

variable "migrations_command" {
  description = "Command used by the Cloud Run migration job."
  type        = list(string)
  default     = ["pnpm"]
}

variable "migrations_cpu" {
  description = "CPU limit for the migration job container."
  type        = string
  default     = "1"
}

variable "migrations_image" {
  description = "Fully qualified migration container image. Defaults to api_image when null."
  type        = string
  default     = null
  nullable    = true
}

variable "migrations_memory" {
  description = "Memory limit for the migration job container."
  type        = string
  default     = "1024Mi"
}

variable "migrations_timeout" {
  description = "Cloud Run migration job task timeout."
  type        = string
  default     = "900s"
}

variable "name_prefix" {
  description = "Prefix used for Mailmon GCP resource names."
  type        = string
  default     = "mailmon"
}

variable "node_env" {
  description = "NODE_ENV value for Cloud Run services."
  type        = string
  default     = "production"
}

variable "project_id" {
  description = "GCP project ID where Mailmon infrastructure is managed."
  type        = string
}

variable "region" {
  description = "Primary GCP region for regional resources."
  type        = string
  default     = "us-central1"
}

variable "secret_manager_key_rotation_period" {
  description = "Rotation period for the KMS key used by Secret Manager secrets."
  type        = string
  default     = "7776000s"
}

variable "watch_renewal_schedule" {
  description = "Cloud Scheduler cron expression for Gmail watch renewal control jobs."
  type        = string
  default     = "*/15 * * * *"
}

variable "watch_renewal_time_zone" {
  description = "Cloud Scheduler time zone used for Gmail watch renewal scheduling."
  type        = string
  default     = "Etc/UTC"
}

variable "stuck_sync_recovery_schedule" {
  description = "Cloud Scheduler cron expression for stuck mailbox sync execution recovery control jobs."
  type        = string
  default     = "*/5 * * * *"
}

variable "stuck_sync_recovery_time_zone" {
  description = "Cloud Scheduler time zone used for stuck mailbox sync execution recovery scheduling."
  type        = string
  default     = "Etc/UTC"
}

variable "webhook_delivery_max_attempts" {
  description = "Maximum Cloud Tasks dispatch attempts for webhook deliveries."
  type        = number
  default     = 5
}

variable "webhook_delivery_max_backoff" {
  description = "Maximum Cloud Tasks retry backoff for webhook deliveries."
  type        = string
  default     = "300s"
}

variable "webhook_delivery_max_concurrent_dispatches" {
  description = "Maximum concurrent webhook delivery task dispatches."
  type        = number
  default     = 50
}

variable "webhook_delivery_max_dispatches_per_second" {
  description = "Maximum webhook delivery task dispatches per second."
  type        = number
  default     = 25
}

variable "webhook_delivery_max_retry_duration" {
  description = "Maximum total retry duration for Cloud Tasks webhook deliveries."
  type        = string
  default     = "3600s"
}

variable "webhook_delivery_min_backoff" {
  description = "Minimum Cloud Tasks retry backoff for webhook deliveries."
  type        = string
  default     = "10s"
}

variable "webhook_delivery_queue_id" {
  description = "Cloud Tasks queue ID used for webhook delivery scheduling."
  type        = string
  default     = "mailmon-webhook-deliveries"
}

variable "worker_base_url" {
  description = "Externally reachable base URL for the worker service internal HTTP endpoints."
  type        = string
}

variable "worker_cpu" {
  description = "CPU limit for the worker Cloud Run container."
  type        = string
  default     = "1"
}

variable "worker_image" {
  description = "Fully qualified worker container image to deploy."
  type        = string
}

variable "worker_ingress" {
  description = "Ingress policy for the worker Cloud Run service."
  type        = string
  default     = "INGRESS_TRAFFIC_INTERNAL_ONLY"
}

variable "worker_max_instance_count" {
  description = "Maximum worker Cloud Run instances."
  type        = number
  default     = 10
}

variable "worker_max_instance_request_concurrency" {
  description = "Maximum concurrent requests per worker Cloud Run instance."
  type        = number
  default     = 20
}

variable "worker_memory" {
  description = "Memory limit for the worker Cloud Run container."
  type        = string
  default     = "1024Mi"
}

variable "worker_min_instance_count" {
  description = "Minimum worker Cloud Run instances."
  type        = number
  default     = 0
}

variable "worker_request_timeout" {
  description = "Worker Cloud Run request timeout."
  type        = string
  default     = "900s"
}

variable "worker_traffic_revision_name" {
  description = "Optional worker Cloud Run revision name to receive 100% traffic. Leave null to route to the latest ready revision."
  type        = string
  default     = null
  nullable    = true
}

variable "github_repository" {
  description = "GitHub repository name in the format 'owner/repo' that is authorized to deploy."
  type        = string
}
