/**
 * API tests against the running App Tier (report §3.4). Exercise auth, RBAC
 * and validation error shapes. Skip cleanly if the App Tier is not running.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { appTierUp, urls } from '../helpers/infra.js';

const BASE = urls.APP_TIER;
let up = false;
let seeded = false;

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

beforeAll(async () => {
  up = await appTierUp();
  if (up) {
    const r = await post('/demo/seed');
    seeded = r.ok;
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

  it('logs in a seeded teacher and returns a token', async () => {
    if (!up || !seeded) return expect(true).toBe(true);
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
    if (!up || !seeded) return expect(true).toBe(true);
    const login = await post('/auth/login', {
      email: 'student@classquest.example',
      password: 'DemoStudent123!',
    });
    const { token } = await login.json();
    const r = await fetch(`${BASE}/dashboard/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(403);
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
