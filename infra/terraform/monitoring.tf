# ----------------------------------------------------------------------
# Amazon CloudWatch — HTTP 400 monitoring pipeline (report 7.6-7.8)
#
# ALB-style access logs -> metric filter counting status_code=400 ->
# metric HTTP400ErrorCount -> alarm when > threshold / minute -> SNS.
# This is the report's specific monitoring requirement (2.2.8):
# "more than 50 '400 HTTP bad request' errors per minute".
# ----------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "alb_access" {
  name              = var.cw_log_group
  retention_in_days = 30
}

# Metric filter: the Web Tier writes JSON access-log events; this counts
# those where status_code == 400 (report 3.9.5 chose a custom filter because
# the built-in HTTPCode_ELB_4XX_Count aggregates all 4XX, not just 400).
resource "aws_cloudwatch_log_metric_filter" "http_400" {
  name           = "ClassQuest-HTTP400-Filter"
  log_group_name = aws_cloudwatch_log_group.alb_access.name
  pattern        = "{ $.status_code = 400 }"

  metric_transformation {
    name          = "HTTP400ErrorCount"
    namespace     = var.cw_namespace
    value         = "1"
    default_value = "0"
  }
}

# Alarm: sum of HTTP400ErrorCount > threshold within one period (report 7.7).
resource "aws_cloudwatch_metric_alarm" "http_400_high" {
  alarm_name          = "ClassQuest-HTTP400-HighErrorRate"
  alarm_description   = "More than ${var.http_400_threshold} HTTP 400 errors in ${var.http_400_period_seconds}s (report 2.2.8)."
  namespace           = var.cw_namespace
  metric_name         = "HTTP400ErrorCount"
  statistic           = "Sum"
  period              = var.http_400_period_seconds
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = var.http_400_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.admin_alerts.arn]
  ok_actions    = [aws_sns_topic.admin_alerts.arn]
}
