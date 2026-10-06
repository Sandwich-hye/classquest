/**
 * API tests against the running App Tier (report §3.4): auth, RBAC, validation,
 * demo gating and resource-open tracking.
 *
 * Requires the Docker stack (`docker compose up -d --build`). When it is not
 * reachable the whole suite is reported as SKIPPED, not passed. When it is
 * reachable, setup failures (login, seeding) fail the suite.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { stackAvailable, urls } from '../helpers/infra.js';

const BASE = urls.APP_TIER;
const available = await stackAvailable('API tests (tests/api)', ['appTier']);

let teacherToken = '';
let studentToken = '';

async function post(path: string, body?: unknown, token?: string) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function login(email: string, password: string): Promise<string> {
  const r = await post('/auth/login', { email, password });
  expect(r.status, `login as ${email}`).toBe(200);
  return (await r.json()).token;
}

/** Wait until the student can see at least one completed asset (worker finished). */
async function completedAssetsForStudent(): Promise<Array<{ id: string; status: string }>> {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${BASE}/assets`, { headers: { Authorization: `Bearer ${studentToken}` } });
    const { assets } = await r.json();
    if (assets.length > 0) return assets;
    await new Promise((res) => setTimeout(res, 1500));
  }
  return [];
}

describe.skipIf(!available)('App Tier API (live stack)', () => {
  beforeAll(async () => {
    // Demo users are created at App Tier startup (DEMO_MODE).
    teacherToken = await login('teacher@classquest.example', 'DemoTeacher123!');
    studentToken = await login('student@classquest.example', 'DemoStudent123!');
    const seed = await post('/demo/seed', undefined, teacherToken);
    expect(seed.status, 'demo seed').toBe(200);
  });

  it('rejects login with a malformed email (400)', async () => {
    const r = await post('/auth/login', { email: 'nope', password: 'x' });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects login with wrong credentials (401)', async () => {
    const r = await post('/auth/login', { email: 'teacher@classquest.example', password: 'wrong' });
    expect(r.status).toBe(401);
  });

  it('logs in the demo teacher (created at startup) with the teacher role', async () => {
    const r = await post('/auth/login', { email: 'teacher@classquest.example', password: 'DemoTeacher123!' });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.token).toBeTruthy();
    expect(body.role).toBe('teacher');
  });

  it('blocks unauthenticated access to the metrics (401)', async () => {
    expect((await fetch(`${BASE}/dashboard/metrics`)).status).toBe(401);
  });

  it('enforces RBAC: a student cannot read ops metrics (403)', async () => {
    const r = await fetch(`${BASE}/dashboard/metrics`, { headers: { Authorization: `Bearer ${studentToken}` } });
    expect(r.status).toBe(403);
  });

  it('students only see completed assets and cannot read jobs', async () => {
    const list = await fetch(`${BASE}/assets`, { headers: { Authorization: `Bearer ${studentToken}` } });
    const { assets } = await list.json();
    expect(assets.every((a: { status: string }) => a.status === 'completed')).toBe(true);
    const job = await fetch(`${BASE}/jobs/any-id`, { headers: { Authorization: `Bearer ${studentToken}` } });
    expect(job.status).toBe(403);
  });

  it('a student open is recorded and reflected in /me/progress', async () => {
    const auth = { Authorization: `Bearer ${studentToken}` };
    const assets = await completedAssetsForStudent();
    expect(assets.length, 'seeded resources should finish processing').toBeGreaterThan(0);
    const before = await (await fetch(`${BASE}/me/progress`, { headers: auth })).json();
    const open = await fetch(`${BASE}/assets/${assets[0]!.id}`, { headers: auth });
    expect(open.status).toBe(200);
    const after = await (await fetch(`${BASE}/me/progress`, { headers: auth })).json();
    expect(after.recent[0].asset.id).toBe(assets[0]!.id);
    expect(after.opened).toBeGreaterThanOrEqual(before.opened);
    expect(after.opened).toBeLessThanOrEqual(after.available);
    expect(after.byType).toHaveProperty('document');
  });

  it('/me/progress is student-only', async () => {
    const r = await fetch(`${BASE}/me/progress`, { headers: { Authorization: `Bearer ${teacherToken}` } });
    expect(r.status).toBe(403);
  });

  it('demo management endpoints require a teacher/admin token', async () => {
    expect((await post('/demo/seed')).status).toBe(401);
    expect((await post('/demo/induce-failure', undefined, studentToken)).status).toBe(403);
  });

  it('demo seed does not return credentials', async () => {
    const r = await post('/demo/seed', undefined, teacherToken);
    const body = await r.json();
    expect(body).not.toHaveProperty('credentials');
    expect(JSON.stringify(body)).not.toMatch(/password/i);
  });

  it('/demo/bad-request always returns 400 (HTTP-400 driver)', async () => {
    expect((await post('/demo/bad-request')).status).toBe(400);
  });

  it('health endpoint reports every dependency', async () => {
    const body = await (await fetch(`${BASE}/health`)).json();
    for (const dep of ['mysql', 's3', 'sqs', 'cloudwatch', 'sns']) expect(body.dependencies).toHaveProperty(dep);
  });
});
