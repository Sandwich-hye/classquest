/**
 * resource_access against a real MySQL/MariaDB: migration, open recording and
 * the /me/progress aggregate. OPT-IN — runs only when TEST_MYSQL_DATABASE
 * names a disposable database (it truncates its tables), e.g.
 *
 *   TEST_MYSQL_DATABASE=cq_progress_test TEST_MYSQL_USER=... TEST_MYSQL_PASSWORD=... \
 *     npx vitest run tests/integration/progressDb.test.ts
 *
 * Never point it at the stack's `classquest` database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const DB = process.env.TEST_MYSQL_DATABASE;
const enabled = !!DB && DB !== 'classquest';
if (!enabled) {
  console.warn('[SKIPPED] Database tests (tests/integration/progressDb): opt-in — set TEST_MYSQL_DATABASE to a disposable database to run.');
}
if (enabled) {
  process.env.MYSQL_HOST = process.env.TEST_MYSQL_HOST ?? '127.0.0.1';
  process.env.MYSQL_PORT = process.env.TEST_MYSQL_PORT ?? '3306';
  process.env.MYSQL_DATABASE = DB;
  process.env.MYSQL_USER = process.env.TEST_MYSQL_USER ?? 'root';
  process.env.MYSQL_PASSWORD = process.env.TEST_MYSQL_PASSWORD ?? '';
}

const shared = await import('../../packages/shared/src/index.js');
const { migrate, getPool, closePool, userRepo, assetRepo, accessRepo } = shared;

describe.skipIf(!enabled)('resource_access (real database)', () => {
  let student = '';
  let other = '';
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await migrate();
    // Run the migration twice: it must stay idempotent on an existing schema.
    await migrate();
    const pool = getPool();
    for (const t of ['resource_access', 'jobs', 'assets', 'request_metrics', 'users']) {
      await pool.query(`DELETE FROM ${t}`);
    }
    const mk = async (email: string, role: 'student' | 'teacher') => {
      await userRepo.createIfAbsent({ email, passwordHash: 'x', role, displayName: email });
      return (await userRepo.findByEmailWithHash(email))!.id;
    };
    const teacher = await mk('t@x.example', 'teacher');
    student = await mk('s@x.example', 'student');
    other = await mk('s2@x.example', 'student');
    const add = async (key: string, type: 'document' | 'book' | 'video', status: 'completed' | 'queued') => {
      const a = await assetRepo.create({
        ownerId: teacher, title: key, type, s3Key: `k/${key}`, s3Bucket: 'b', sizeBytes: 1, contentType: 'text/plain', isDemo: true,
      });
      await assetRepo.setStatus(a.id, status);
      ids[key] = a.id;
    };
    await add('doc1', 'document', 'completed');
    await add('doc2', 'document', 'completed');
    await add('book1', 'book', 'completed');
    await add('vid1', 'video', 'completed');
    await add('pending', 'document', 'queued');
  });

  afterAll(async () => {
    await closePool();
  });

  it('starts with nothing opened', async () => {
    const p = await accessRepo.progressFor(student);
    expect(p).toMatchObject({ available: 4, opened: 0, coverage: 0, lastOpenedAt: null, recent: [] });
    expect(p.byType).toEqual({
      document: { opened: 0, available: 2 },
      book: { opened: 0, available: 1 },
      video: { opened: 0, available: 1 },
    });
  });

  it('first open inserts; repeat opens bump open_count and last_opened_at', async () => {
    await accessRepo.recordOpen(student, ids.doc1!);
    const [[first]] = (await getPool().query(
      'SELECT open_count, first_opened_at, last_opened_at FROM resource_access WHERE user_id = ? AND asset_id = ?',
      [student, ids.doc1],
    )) as unknown as [Array<{ open_count: number; first_opened_at: Date; last_opened_at: Date }>];
    expect(first!.open_count).toBe(1);

    await new Promise((r) => setTimeout(r, 1100)); // TIMESTAMP has 1 s resolution
    await accessRepo.recordOpen(student, ids.doc1!);
    await accessRepo.recordOpen(student, ids.doc1!);
    const [[again]] = (await getPool().query(
      'SELECT open_count, first_opened_at, last_opened_at FROM resource_access WHERE user_id = ? AND asset_id = ?',
      [student, ids.doc1],
    )) as unknown as [Array<{ open_count: number; first_opened_at: Date; last_opened_at: Date }>];
    expect(again!.open_count).toBe(3);
    expect(new Date(again!.first_opened_at).getTime()).toBe(new Date(first!.first_opened_at).getTime());
    expect(new Date(again!.last_opened_at).getTime()).toBeGreaterThan(new Date(first!.last_opened_at).getTime());
  });

  it('aggregates distinct opens per type, coverage and recent order', async () => {
    await new Promise((r) => setTimeout(r, 1100));
    await accessRepo.recordOpen(student, ids.vid1!);
    await accessRepo.recordOpen(other, ids.book1!); // another student's open must not count

    const p = await accessRepo.progressFor(student);
    expect(p.available).toBe(4);
    expect(p.opened).toBe(2);
    expect(p.coverage).toBe(0.5);
    expect(p.byType.document).toEqual({ opened: 1, available: 2 });
    expect(p.byType.video).toEqual({ opened: 1, available: 1 });
    expect(p.byType.book).toEqual({ opened: 0, available: 1 });
    expect(p.recent.map((r) => r.asset.title)).toEqual(['vid1', 'doc1']);
    expect(p.recent[1]!.openCount).toBe(3);
    expect(p.lastOpenedAt).toBe(p.recent[0]!.lastOpenedAt);
  });

  it('ignores opens of assets that are no longer completed', async () => {
    await accessRepo.recordOpen(student, ids.pending!); // not reachable via the API; guards the aggregate
    const p = await accessRepo.progressFor(student);
    expect(p.opened).toBe(2);
    expect(p.recent.some((r) => r.asset.title === 'pending')).toBe(false);
  });
});
