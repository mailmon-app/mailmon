variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "us-central1"
}

variable "gmail_push_topic_name" {
  description = "Pub/Sub topic name passed to Gmail watch registration."
  type        = string
  default     = "gmail-push"
}

variable "gmail_push_subscription_name" {
  description = "Pub/Sub push subscription name for Gmail Push Notifications."
  type        = string
  default     = "gmail-push-worker"
}

variable "worker_base_url" {
  description = "Base URL for the worker Cloud Run service."
  type        = string
}

variable "worker_invoker_service_account_email" {
  description = "Optional service account email used for Pub/Sub and Scheduler OIDC worker calls."
  type        = string
  default     = null
}

variable "watch_renewal_schedule" {
  description = "Cloud Scheduler cron expression for Gmail watch renewal."
  type        = string
  default     = "*/15 * * * *"
}

variable "watch_renewal_time_zone" {
  description = "Cloud Scheduler time zone for Gmail watch renewal."
  type        = string
  default     = "Etc/UTC"
}
