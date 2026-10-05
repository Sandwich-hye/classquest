/**
 * Credential-less service access (report 2.3.6, 6.2, 6.10).
 *
 * In real AWS, EC2 instances carry an IAM instance profile and the SDK's
 * default credential provider chain supplies short-lived, auto-rotated
 * credentials — no static keys in code or config. This helper documents and
 * (optionally) exercises role assumption so the pattern is explicit.
 *
 * Under LocalStack, STS AssumeRole returns usable temporary credentials, so
 * the same code path runs; the dummy "test" credentials are NOT real secrets.
 */
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('iam');

function stsClient(): STSClient {
  const cfg = loadConfig();
  return new STSClient({
    region: cfg.awsRegion,
    ...(cfg.awsEndpointUrl ? { endpoint: cfg.awsEndpointUrl } : {}),
  });
}

/**
 * Demonstrates the credential-less flow: assume a role and obtain temporary
 * credentials. Returns true if assumption succeeded. Non-fatal if it fails
 * under LocalStack — the SDK still uses the default chain for actual calls.
 */
export async function assumeServiceRole(roleArn: string, sessionName: string): Promise<boolean> {
  try {
    const out = await stsClient().send(
      new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: sessionName, DurationSeconds: 900 }),
    );
    const ok = !!out.Credentials?.AccessKeyId;
    log.info({ roleArn, assumed: ok }, 'assumeServiceRole');
    return ok;
  } catch (err) {
    log.warn({ roleArn, err: (err as Error).message }, 'assumeServiceRole failed (non-fatal under LocalStack)');
    return false;
  }
}

/** Confirms the SDK has usable credentials (identity probe for /health). */
export async function hasUsableCredentials(): Promise<boolean> {
  try {
    await stsClient().send(new GetCallerIdentityCommand({}));
    return true;
  } catch {
    return false;
  }
}
