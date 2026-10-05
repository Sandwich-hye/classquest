# ----------------------------------------------------------------------
# Amazon SQS — async asset-processing pipeline (report 3.7)
# Main queue + dead-letter queue with redrive after 3 attempts (report 10.10).
# ----------------------------------------------------------------------

resource "aws_sqs_queue" "dlq" {
  name                      = var.sqs_dlq_name
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "processing" {
  name                       = var.sqs_queue_name
  visibility_timeout_seconds = 30
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 5      # long polling (cost/efficiency)

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

# ----------------------------------------------------------------------
# Amazon SNS — admin alerting for the HTTP-400 alarm (report 7.8)
# ----------------------------------------------------------------------

resource "aws_sns_topic" "admin_alerts" {
  name = var.sns_topic_name
}

# Email subscription. Under LocalStack the confirmation/delivery is captured
# locally rather than sent to a real inbox (documented limitation).
resource "aws_sns_topic_subscription" "admin_email" {
  topic_arn = aws_sns_topic.admin_alerts.arn
  protocol  = "email"
  endpoint  = var.admin_alert_email
}
