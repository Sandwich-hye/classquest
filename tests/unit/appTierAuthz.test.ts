/**
 * In-process App Tier authorisation tests (no Docker needed). The real Express
 * app, auth middleware and routes run; MySQL/S3/SQS are replaced by fakes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

process.env.JWT_SECRET = 'test-secret';
process.env.DEMO_MODE = 'true';

const fx = vi.hoisted(() => {
  const asset = (id: string, status: string) => ({
    id, ownerId: 't1', title: `Asset ${id}`, type: 'document', s3Key: `documents/${id}`, s3Bucket: 'b',
    sizeBytes: 1, contentType: 'text/plain', storageClass: 'STANDARD', status, isDemo: false,
    createdAt: '', updatedAt: '',
  });
  return {
    assets: { c1: asset('c1', 'completed'), q1: asset('q1', 'queued'), p1: asset('p1', 'processing'), f1: asset('f1', 'failed') } as Record<string, ReturnType<typeof asset>>,
    listFilter: undefined as unknown,
    presign: vi.fn(async (key: string) => `http://s3/${key}?sig`),
    publish: vi.fn(async (i: { title: string }) => ({ asset: { id: 'new', status: 'queued', title: i.title }, jobId: 'jnew' })),
  };
});

vi.mock('@classquest/shared', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@classquest/shared')>();
  class Stub { async incrementCounter() {} async recordLatency() {} async putMetric() {} }
  return {
    ...orig,
    MetricsService: Stub,
    metricsRepo: { record: async () => {} },
    assetRepo: {
      findById: async (id: string) => fx.assets[id] ?? null,
      list: async (filter?: { status?: string }) => {
        fx.listFilter = filter;
        return Object.values(fx.assets).filter((a) => !filter?.status || a.status === filter.status);
      },
    },
    jobRepo: {
      findById: async (id: string) => ({ id, assetId: 'q1', state: 'queued', attempts: 0, lastError: null,
        submittedAt: '', startedAt: null, finishedAt: null }),
    },
    userRepo: {
      createIfAbsent: async () => false,
      findByEmailWithHash: async () => ({ id: 't1', email: 'teacher@classquest.example', role: 'teacher',
        displayName: 'T', createdAt: '', passwordHash: 'x' }),
    },
  };
});

vi.mock('../../services/app-tier/src/services.js', () => ({
  config: { maxUploadBytes: 1_000_000, worker: { maxAttempts: 3 } },
  storage: { getPresignedUrl: fx.presign, headObjectTier: async () => 'STANDARD' },
  queue: {}, metrics: { incrementCounter: async () => {} }, alerts: {},
}));
vi.mock('../../services/app-tier/src/publish.js', () => ({ publishAsset: fx.publish }));

const shared = await import('@classquest/shared');
const { createApp } = await import('../../services/app-tier/src/app.js');

const token = (role: 'student' | 'teacher' | 'admin') =>
  `Bearer ${shared.issueToken({ sub: `${role}-id`, email: `${role}@x.example`, role, displayName: role })}`;
const student = token('student');
const teacher = token('teacher');
const admin = token('admin');

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  shared.resetConfigCache();
  process.env.DEMO_MODE = 'true';
  app = createApp();
  fx.presign.mockClear();
  fx.publish.mockClear();
});

describe('asset visibility', () => {
  it('students only list completed assets', async () => {
    const r = await request(app).get('/assets').set('Authorization', student);
    expect(r.status).toBe(200);
    expect(fx.listFilter).toMatchObject({ status: 'completed' });
    expect(r.body.assets.map((a: { id: string }) => a.id)).toEqual(['c1']);
  });

  it('teachers list assets in every state', async () => {
    const r = await request(app).get('/assets').set('Authorization', teacher);
    expect((fx.listFilter as { status?: string }).status).toBeUndefined();
    expect(r.body.assets).toHaveLength(4);
  });

  it('students get a presigned URL for a completed asset', async () => {
    const r = await request(app).get('/assets/c1').set('Authorization', student);
    expect(r.status).toBe(200);
    expect(r.body.downloadUrl).toContain('documents/c1');
  });

  it.each(['q1', 'p1', 'f1'])('students get 404 and no presigned URL for unpublished asset %s', async (id) => {
    const r = await request(app).get(`/assets/${id}`).set('Authorization', student);
    expect(r.status).toBe(404);
    expect(fx.presign).not.toHaveBeenCalled();
  });

  it('teachers and admins can open unpublished assets', async () => {
    expect((await request(app).get('/assets/q1').set('Authorization', teacher)).status).toBe(200);
    expect((await request(app).get('/assets/f1').set('Authorization', admin)).status).toBe(200);
  });
});

describe('job endpoints are teacher/admin only', () => {
  it('students are forbidden', async () => {
    expect((await request(app).get('/jobs/j1').set('Authorization', student)).status).toBe(403);
    expect((await request(app).get('/assets/q1/job').set('Authorization', student)).status).toBe(403);
  });
  it('teachers and admins are allowed', async () => {
    expect((await request(app).get('/jobs/j1').set('Authorization', teacher)).status).toBe(200);
    expect((await request(app).get('/assets/q1/job').set('Authorization', admin)).status).toBe(200);
  });
  it('unauthenticated requests are rejected', async () => {
    expect((await request(app).get('/jobs/j1')).status).toBe(401);
  });
});

describe('upload', () => {
  it('ignores ?induceFailure=true on the normal upload endpoint', async () => {
    const r = await request(app)
      .post('/assets?induceFailure=true')
      .set('Authorization', teacher)
      .field('title', 'Notes')
      .field('type', 'document')
      .attach('file', Buffer.from('hello'), { filename: 'n.txt', contentType: 'text/plain' });
    expect(r.status).toBe(202);
    expect(fx.publish).toHaveBeenCalledTimes(1);
    expect(fx.publish.mock.calls[0][0]).not.toHaveProperty('induceFailure');
  });

  it('students cannot upload', async () => {
    const r = await request(app)
      .post('/assets')
      .set('Authorization', student)
      .field('title', 'x').field('type', 'document')
      .attach('file', Buffer.from('x'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(r.status).toBe(403);
    expect(fx.publish).not.toHaveBeenCalled();
  });
});

describe('demo controls (DEMO_MODE=true)', () => {
  it('/demo/bad-request stays unauthenticated and returns 400', async () => {
    expect((await request(app).post('/demo/bad-request')).status).toBe(400);
  });

  it.each(['/demo/seed', '/demo/induce-failure', '/demo/lifecycle-simulate'])(
    '%s requires authentication and a teacher/admin role',
    async (path) => {
      expect((await request(app).post(path)).status).toBe(401);
      expect((await request(app).post(path).set('Authorization', student)).status).toBe(403);
    },
  );

  it('seed never returns passwords', async () => {
    const r = await request(app).post('/demo/seed').set('Authorization', teacher);
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty('credentials');
    expect(JSON.stringify(r.body)).not.toMatch(/password|Demo(Teacher|Student|Admin)123/i);
    expect(r.body.users.length).toBeGreaterThan(0);
  });

  it('induce-failure flags the job for failure via the demo path only', async () => {
    const r = await request(app).post('/demo/induce-failure').set('Authorization', admin);
    expect(r.status).toBe(202);
    expect(fx.publish.mock.calls[0][0]).toMatchObject({ induceFailure: true, isDemo: true });
  });
});

describe('demo controls (DEMO_MODE=false)', () => {
  it('every /demo route is absent', async () => {
    shared.resetConfigCache();
    process.env.DEMO_MODE = 'false';
    const off = createApp();
    expect((await request(off).post('/demo/bad-request')).status).toBe(404);
    expect((await request(off).post('/demo/seed').set('Authorization', teacher)).status).toBe(404);
  });
});
