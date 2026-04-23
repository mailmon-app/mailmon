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

variable "project_id" {
  description = "GCP project ID where Mailmon infrastructure is managed."
  type        = string
}

variable "region" {
  description = "Primary GCP region for regional resources."
  type        = string
  default     = "us-central1"
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

variable "worker_base_url" {
  description = "Base URL for the worker service internal HTTP endpoints."
  type        = string
}

variable "worker_invoker_service_account_email" {
  description = "Optional service account email used for Pub/Sub and Scheduler OIDC calls to worker endpoints."
  type        = string
  default     = null
  nullable    = true
}
