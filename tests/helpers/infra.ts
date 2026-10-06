/**
 * Live-stack detection for the Docker-dependent suites (api, integration,
 * e2e). Suites call `stackAvailable(...)` at module load and wrap themselves
 * in `describe.skipIf(!available)`, so when Docker/LocalStack is not running
 * they are reported as SKIPPED — never as passed.
 */
const WEB_TIER = process.env.TEST_WEB_TIER_URL ?? 'http://localhost:8080';
const APP_TIER = process.env.TEST_APP_TIER_URL ?? 'http://localhost:4000';
const LOCALSTACK = process.env.TEST_LOCALSTACK_URL ?? 'http://localhost:4566';

async function reachable(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    // /health answers 503 when a core dependency is down; that still means
    // the tier itself is running, but the suites need a healthy stack.
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function localstackUp(): Promise<boolean> {
  return reachable(`${LOCALSTACK}/_localstack/health`);
}

export async function appTierUp(): Promise<boolean> {
  return reachable(`${APP_TIER}/health`);
}

export async function webTierUp(): Promise<boolean> {
  return reachable(`${WEB_TIER}/healthz`);
}

type Service = 'localstack' | 'appTier' | 'webTier';
const PROBES: Record<Service, [() => Promise<boolean>, string]> = {
  localstack: [localstackUp, `LocalStack (${LOCALSTACK})`],
  appTier: [appTierUp, `App Tier (${APP_TIER})`],
  webTier: [webTierUp, `Web Tier (${WEB_TIER})`],
};

/**
 * True when every required service is reachable. Otherwise prints one clear
 * notice naming the suite and the missing services, and returns false.
 */
export async function stackAvailable(suite: string, required: Service[]): Promise<boolean> {
  const missing: string[] = [];
  for (const s of required) {
    const [probe, label] = PROBES[s];
    if (!(await probe())) missing.push(label);
  }
  if (missing.length > 0) {
    console.warn(
      `[SKIPPED] ${suite}: Docker stack not reachable — ${missing.join(', ')}. ` +
        'Start it with `docker compose up -d --build` to run these tests.',
    );
    return false;
  }
  return true;
}

export const urls = { WEB_TIER, APP_TIER, LOCALSTACK };
