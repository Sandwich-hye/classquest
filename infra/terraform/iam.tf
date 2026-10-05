# ----------------------------------------------------------------------
# AWS IAM — credential-less, least-privilege service access (report 2.3.6, 6.2)
#
# Two roles mirror the report's web-read / app-write privilege split:
#   classquest-web-role : read-only S3 + write access logs
#   classquest-app-role : read/write S3, SQS, CloudWatch metrics + logs
# EC2 instances assume these via instance profiles (credential-less).
# ----------------------------------------------------------------------

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# ---- Web Tier role: least privilege (read-only object access + logs) ----
resource "aws_iam_role" "web" {
  name               = "classquest-web-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "web_policy" {
  statement {
    sid       = "ReadAssets"
    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
  }
  statement {
    sid       = "WriteAccessLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.alb_access.arn}:*"]
  }
}

resource "aws_iam_role_policy" "web" {
  name   = "classquest-web-policy"
  role   = aws_iam_role.web.id
  policy = data.aws_iam_policy_document.web_policy.json
}

resource "aws_iam_instance_profile" "web" {
  name = "classquest-web-profile"
  role = aws_iam_role.web.name
}

# ---- Application Tier role: read/write to S3, SQS, CloudWatch ----
resource "aws_iam_role" "app" {
  name               = "classquest-app-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "app_policy" {
  statement {
    sid       = "ReadWriteAssets"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
  }
  statement {
    sid       = "QueueAccess"
    actions   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"]
    resources = [aws_sqs_queue.processing.arn, aws_sqs_queue.dlq.arn]
  }
  statement {
    sid       = "PutMetrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"] # PutMetricData does not support resource-level scoping
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = [var.cw_namespace]
    }
  }
  statement {
    sid       = "WriteLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.alb_access.arn}:*"]
  }
}

resource "aws_iam_role_policy" "app" {
  name   = "classquest-app-policy"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app_policy.json
}

resource "aws_iam_instance_profile" "app" {
  name = "classquest-app-profile"
  role = aws_iam_role.app.name
}
