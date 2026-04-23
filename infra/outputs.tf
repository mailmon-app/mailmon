output "gmail_pubsub_topic_name" {
  description = "Full Gmail Pub/Sub topic resource name for MAILMON_GMAIL_PUBSUB_TOPIC_NAME."
  value       = google_pubsub_topic.gmail_push.id
}
