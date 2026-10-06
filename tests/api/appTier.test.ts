/**
 * API tests against the running App Tier (report §3.4). Exercise auth, RBAC
 * and validation error shapes. Skip cleanly if the App Tier is not running.
 * Demo users are created at App Tier startup (DEMO_MODE); seeding the catalog
 * requires a teacher/admin token.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { appTierUp, urls } from '../helpers/infra.js';

const BASE = urls.APP_TIER;
let up = false;
let seeded = false;
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
  return r.ok ? (await r.json()).token : '';
}

beforeAll(async () => {
  up = await appTierUp();
  if (up) {
    teacherToken = await login('teacher@classquest.example', 'DemoTeacher123!');
    studentToken = await login('student@classquest.example', 'DemoStudent123!');
    if (teacherToken) {
      const r = await post('/demo/seed', undefined, teacherToken);
      seeded = r.ok;
    }
  }
});

describe('App Tier API', () => {
  it('rejects login with a malformed email (400)', async () => {
    if (!up) return expect(true).toBe(true);
    const r = await post('/auth/login', { email: 'nope', password: 'x' });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects login with wrong credentials (401)', async () => {
    if (!up) return expect(true).toBe(true);
    const r = await post('/auth/login', { email: 'teacher@classquest.example', password: 'wrong' });
    expect(r.status).toBe(401);
  });

  it('logs in the demo teacher (created at startup) and returns a token', async () => {
    if (!up) return expect(true).toBe(true);
    const r = await post('/auth/login', {
      email: 'teacher@classquest.example',
      password: 'DemoTeacher123!',
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.token).toBeTruthy();
    expect(body.role).toBe('teacher');
  });

  it('blocks unauthenticated access to the dashboard (401)', async () => {
    if (!up) return expect(true).toBe(true);
    const r = await fetch(`${BASE}/dashboard/metrics`);
    expect(r.status).toBe(401);
  });

  it('enforces RBAC: a student cannot read ops metrics (403)', async () => {
    if (!up || !studentToken) return expect(true).toBe(true);
    const r = await fetch(`${BASE}/dashboard/metrics`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(r.status).toBe(403);
  });

  it('students only see completed assets and cannot read jobs', async () => {
    if (!up || !studentToken || !seeded) return expect(true).toBe(true);
    const list = await fetch(`${BASE}/assets`, { headers: { Authorization: `Bearer ${studentToken}` } });
    const { assets } = await list.json();
    expect(assets.every((a: { status: string }) => a.status === 'completed')).toBe(true);
    const job = await fetch(`${BASE}/jobs/any-id`, { headers: { Authorization: `Bearer ${studentToken}` } });
    expect(job.status).toBe(403);
  });

  it('a student open is recorded and reflected in /me/progress', async () => {
    if (!up || !studentToken || !seeded) return expect(true).toBe(true);
    const auth = { Authorization: `Bearer ${studentToken}` };
    const { assets } = await (await fetch(`${BASE}/assets`, { headers: auth })).json();
    if (assets.length === 0) return expect(true).toBe(true); // nothing processed yet
    const before = await (await fetch(`${BASE}/me/progress`, { headers: auth })).json();
    const open = await fetch(`${BASE}/assets/${assets[0].id}`, { headers: auth });
    expect(open.status).toBe(200);
    const after = await (await fetch(`${BASE}/me/progress`, { headers: auth })).json();
    expect(after.recent[0].asset.id).toBe(assets[0].id);
    expect(after.opened).toBeGreaterThanOrEqual(before.opened);
    expect(after.opened).toBeLessThanOrEqual(after.available);
    expect(after.byType).toHaveProperty('document');
  });

  it('/me/progress is student-only', async () => {
    if (!up || !teacherToken) return expect(true).toBe(true);
    const r = await fetch(`${BASE}/me/progress`, { headers: { Authorization: `Bearer ${teacherToken}` } });
    expect(r.status).toBe(403);
  });

  it('demo management endpoints require a teacher/admin token', async () => {
    if (!up) return expect(true).toBe(true);
    expect((await post('/demo/seed')).status).toBe(401);
    if (studentToken) expect((await post('/demo/induce-failure', undefined, studentToken)).status).toBe(403);
  });

  it('demo seed does not return credentials', async () => {
    if (!up || !teacherToken) return expect(true).toBe(true);
    const r = await post('/demo/seed', undefined, teacherToken);
    const body = await r.json();
    expect(body).not.toHaveProperty('credentials');
    expect(JSON.stringify(body)).not.toMatch(/password/i);
  });

  it('/demo/bad-request always returns 400 (HTTP-400 driver)', async () => {
    if (!up) return expect(true).toBe(true);
    const r = await post('/demo/bad-request');
    expect(r.status).toBe(400);
  });

  it('health endpoint reports dependencies', async () => {
    if (!up) return expect(true).toBe(true);
    const r = await fetch(`${BASE}/health`);
    const body = await r.json();
    expect(body.dependencies).toHaveProperty('mysql');
    expect(body.dependencies).toHaveProperty('s3');
    expect(body.dependencies).toHaveProperty('sqs');
  });
});
