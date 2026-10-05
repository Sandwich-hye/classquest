# Variable values for the LocalStack demo target.
cloud_target        = "localstack"
localstack_endpoint = "http://localstack:4566"
aws_region          = "ap-southeast-2"
env_name            = "dev"

s3_bucket      = "classquest-media-assets-dev"
sqs_queue_name = "classquest-asset-processing"
sqs_dlq_name   = "classquest-asset-processing-dlq"
sns_topic_name = "classquest-admin-alerts"
cw_log_group   = "/aws/alb/classquest-dev"
cw_namespace   = "ClassQuest/Prototype"

admin_alert_email       = "sysadmin@classquest.example"
http_400_threshold      = 50
http_400_period_seconds = 60
glacier_transition_days = 90
expiration_days         = 1825
