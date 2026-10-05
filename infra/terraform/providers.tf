# ----------------------------------------------------------------------
# Provider configuration with dual targeting.
# When cloud_target = "localstack", all service endpoints point at
# LocalStack and credentials are the LocalStack dummy values ("test").
# When cloud_target = "aws", endpoints are omitted and real AWS
# credentials/role are used (supply via environment / assumed role —
# never hardcode, per report 6.10).
# ----------------------------------------------------------------------

locals {
  is_localstack = var.cloud_target == "localstack"
}

provider "aws" {
  region = var.aws_region

  # LocalStack-only convenience settings
  access_key                  = local.is_localstack ? "test" : null
  secret_key                  = local.is_localstack ? "test" : null
  s3_use_path_style           = local.is_localstack
  skip_credentials_validation = local.is_localstack
  skip_metadata_api_check     = local.is_localstack
  skip_requesting_account_id  = local.is_localstack

  dynamic "endpoints" {
    for_each = local.is_localstack ? [1] : []
    content {
      s3         = var.localstack_endpoint
      sqs        = var.localstack_endpoint
      sns        = var.localstack_endpoint
      cloudwatch = var.localstack_endpoint
      logs       = var.localstack_endpoint
      iam        = var.localstack_endpoint
      sts        = var.localstack_endpoint
    }
  }

  default_tags {
    tags = {
      Project     = "ClassQuest"
      Environment = var.env_name
      ManagedBy   = "Terraform"
      Source      = "INFS803-prototype"
    }
  }
}
