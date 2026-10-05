/**
 * Test helpers to detect whether the live stack is available so that
 * infra-dependent suites skip cleanly on a machine without Docker running.
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

export const urls = { WEB_TIER, APP_TIER, LOCALSTACK };
