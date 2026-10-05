variable "cloud_target" {
  description = "Where to provision: 'localstack' (demo) or 'aws' (real cloud)."
  type        = string
  default     = "localstack"
  validation {
    condition     = contains(["localstack", "aws"], var.cloud_target)
    error_message = "cloud_target must be 'localstack' or 'aws'."
  }
}

variable "aws_region" {
  description = "AWS region. Report targets ap-southeast-2 (Sydney) for trans-Tasman residency (report 3.2)."
  type        = string
  default     = "ap-southeast-2"
}

variable "localstack_endpoint" {
  description = "LocalStack endpoint used when cloud_target = localstack."
  type        = string
  default     = "http://localstack:4566"
}

variable "env_name" {
  description = "Environment name suffix (dev/test/prod)."
  type        = string
  default     = "dev"
}

variable "s3_bucket" {
  description = "Media asset bucket (report 5.4)."
  type        = string
  default     = "classquest-media-assets-dev"
}

variable "sqs_queue_name" {
  description = "Async asset-processing queue (report 3.7)."
  type        = string
  default     = "classquest-asset-processing"
}

variable "sqs_dlq_name" {
  description = "Dead-letter queue for poison messages (report 10.10)."
  type        = string
  default     = "classquest-asset-processing-dlq"
}

variable "sns_topic_name" {
  description = "Admin alert topic (report 7.8)."
  type        = string
  default     = "classquest-admin-alerts"
}

variable "cw_log_group" {
  description = "ALB-style access log group for the HTTP-400 metric filter (report 7.6)."
  type        = string
  default     = "/aws/alb/classquest-dev"
}

variable "cw_namespace" {
  description = "CloudWatch custom metric namespace."
  type        = string
  default     = "ClassQuest/Prototype"
}

variable "admin_alert_email" {
  description = "Admin email for SNS subscription (prod). Captured locally under LocalStack (report 7.8)."
  type        = string
  default     = "sysadmin@classquest.example"
}

variable "http_400_threshold" {
  description = "HTTP 400 errors per minute that trigger the alarm (report 2.2.8 / 7.7)."
  type        = number
  default     = 50
}

variable "http_400_period_seconds" {
  description = "Evaluation period for the HTTP-400 alarm."
  type        = number
  default     = 60
}

variable "glacier_transition_days" {
  description = "Days before objects transition Standard -> Glacier (report 5.4.5)."
  type        = number
  default     = 90
}

variable "expiration_days" {
  description = "Days before objects expire — 5-year retention (report 5.4.3)."
  type        = number
  default     = 1825
}
