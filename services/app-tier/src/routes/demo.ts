/**
 * Demo-mode routes (brief §18, FR-11). Lets an evaluator run a predictable
 * demonstration: seed labelled sample data, run a successful workflow, induce
 * a failure (-> DLQ), and trigger an HTTP-400 burst (-> CloudWatch alarm).
 *
 * All seeded data is flagged is_demo = true and labelled DEMO/SAMPLE. These
 * endpoints are intentionally open so the demo is easy to run; in a real
 * deployment they would be admin-gated or removed.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  userRepo,
  assetRepo,
  jobRepo,
  hashPassword,
  type ProcessingMessage,
} from '@classquest/shared';
import { storage, queue, config } from '../services.js';
import { loadSampleUsers, loadSampleCatalog, loadSampleAsset } from '../sampleData.js';
import { ApiError } from '../middleware.js';

export const demoRouter = Router();

/** POST /demo/seed — create demo users and upload the sample catalog. */
demoRouter.post('/seed', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await loadSampleUsers();
    for (const u of users) {
      await userRepo.upsert({
        email: u.email,
        passwordHash: hashPassword(u.password),
        role: u.role,
        displayName: u.displayName,
      });
    }
    const teacher = await userRepo.findByEmailWithHash('teacher@classquest.example');
    const catalog = await loadSampleCatalog();
    const created: Array<{ assetId: string; jobId: string; title: string }> = [];

    for (const entry of catalog) {
      const body = await loadSampleAsset(entry.filename);
      const key = storage.buildKey(entry.type, entry.filename);
      await storage.putObject(key, body, entry.contentType);
      const asset = await assetRepo.create({
        ownerId: teacher!.id,
        title: entry.title,
        type: entry.type,
        s3Key: key,
        s3Bucket: storage.bucketName,
        sizeBytes: body.length,
        contentType: entry.contentType,
        isDemo: true,
      });
      const job = await jobRepo.create(asset.id);
      const message: ProcessingMessage = {
        jobId: job.id,
        assetId: asset.id,
        s3Bucket: asset.s3Bucket,
        s3Key: asset.s3Key,
        type: asset.type,
      };
      await queue.enqueue(message);
      await assetRepo.setStatus(asset.id, 'queued');
      await jobRepo.setState(job.id, 'queued');
      created.push({ assetId: asset.id, jobId: job.id, title: entry.title });
    }

    res.json({
      message: 'Demo data seeded (all records labelled DEMO/SAMPLE).',
      users: users.map((u) => ({ email: u.email, role: u.role })),
      assets: created,
      credentials: users.map((u) => ({ email: u.email, password: u.password, role: u.role })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /demo/induce-failure — enqueue a job that the worker will fail, so the
 * evaluator can watch retry + DLQ + status=failed (report 10.10, AC-3).
 */
demoRouter.post('/induce-failure', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const teacher = await userRepo.findByEmailWithHash('teacher@classquest.example');
    if (!teacher) throw new ApiError(400, 'NOT_SEEDED', 'Run /demo/seed first');
    const body = Buffer.from('DEMO poison message — intentionally fails processing.\n');
    const key = storage.buildKey('document', 'induced-failure.txt');
    await storage.putObject(key, body, 'text/plain');
    const asset = await assetRepo.create({
      ownerId: teacher.id,
      title: 'DEMO — Induced failure (expected to fail)',
      type: 'document',
      s3Key: key,
      s3Bucket: storage.bucketName,
      sizeBytes: body.length,
      contentType: 'text/plain',
      isDemo: true,
    });
    const job = await jobRepo.create(asset.id);
    const message: ProcessingMessage = {
      jobId: job.id,
      assetId: asset.id,
      s3Bucket: asset.s3Bucket,
      s3Key: asset.s3Key,
      type: asset.type,
      induceFailure: true,
    };
    await queue.enqueue(message);
    await assetRepo.setStatus(asset.id, 'queued');
    await jobRepo.setState(job.id, 'queued');
    res.status(202).json({
      message: 'Induced-failure job enqueued; expect retries then status=failed (DLQ).',
      assetId: asset.id,
      jobId: job.id,
      maxAttempts: config.worker.maxAttempts,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /demo/bad-request — always responds 400. Used by the HTTP-400 burst
 * demonstration so the Web Tier access logs record status_code=400, driving
 * the CloudWatch metric filter -> alarm -> SNS (report 2.2.8, 7.6; AC-4).
 * No auth so the burst reliably produces 400 (not 401) through the edge.
 */
demoRouter.all('/bad-request', (_req: Request, res: Response) => {
  res.status(400).json({
    error: { code: 'DEMO_BAD_REQUEST', message: 'Intentional 400 for HTTP-400 alarm demonstration' },
  });
});

/**
 * POST /demo/lifecycle-simulate — move completed demo assets to the GLACIER
 * tier to demonstrate the 90-day transition on demand (report 5.4.5, AC-6).
 */
demoRouter.post('/lifecycle-simulate', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const assets = await assetRepo.list();
    const demoAssets = assets.filter((a) => a.isDemo && a.status === 'completed');
    const transitioned: string[] = [];
    for (const a of demoAssets.slice(0, 10)) {
      await storage.simulateTransitionToGlacier(a.s3Key, a.contentType);
      await assetRepo.setStorageClass(a.id, 'GLACIER');
      transitioned.push(a.title);
    }
    res.json({
      message: 'Simulated Standard -> Glacier lifecycle transition (report 5.4.5).',
      transitionedCount: transitioned.length,
      transitioned,
    });
  } catch (err) {
    next(err);
  }
});
