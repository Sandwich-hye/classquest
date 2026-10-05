# Infrastructure as Code (Terraform)

Provisions the ClassQuest cloud resources described in the report, with **dual targeting**:
`localstack` (demo, default) and `aws` (real cloud). Infrastructure is kept separate from
application logic (brief §11).

## Resources created

| File | Resources | Report § |
|------|-----------|----------|
| `s3.tf` | S3 bucket, versioning, Block Public Access, SSE, 5-year lifecycle (Standard → Glacier @90d → expire @1825d) | §5.4 |
| `messaging.tf` | SQS processing queue + DLQ (redrive maxReceiveCount=3), SNS admin-alerts topic + email subscription | §3.7, §10.10, §7.8 |
| `monitoring.tf` | CloudWatch log group, HTTP-400 metric filter, alarm (>50/min) → SNS | §7.6–§7.8 |
| `iam.tf` | `classquest-web-role` (read-only), `classquest-app-role` (read/write), instance profiles — least privilege | §2.3.6, §6.2 |
| `providers.tf` | AWS provider with LocalStack endpoint overrides | §7 mapping |

## Usage

LocalStack (default — this runs automatically inside `docker compose up`):

```bash
cd infra/terraform
terraform init
terraform apply -auto-approve -var-file=localstack.tfvars
```

Real AWS (optional):

```bash
cp aws.tfvars.example aws.tfvars   # edit bucket name + admin email
terraform apply -var-file=aws.tfvars
```

> Never commit `aws.tfvars`, `*.tfstate`, or credentials. See the repo `.gitignore`.

## Notes / fidelity

- VPC, subnets, Route 53, NLB/ALB, Auto Scaling, WAF/Shield from the report are **documented** in
  `ARCHITECTURE.md` and represented behaviourally by Docker Compose; they are not provisioned here
  because the prototype runs locally. Adding them for the `aws` target is a documented future step.
- `force_destroy = true` on the bucket is a prototype convenience and must be removed for production.
