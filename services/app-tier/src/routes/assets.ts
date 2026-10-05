/**
 * Asset routes — the primary end-to-end workflow (report 3.7, FR-2/3/4/5/7).
 *
 *   POST /assets   (teacher)  -> S3 putObject + MySQL insert + SQS enqueue
 *   GET  /assets              -> list published assets
 *   GET  /assets/:id          -> metadata + presigned download URL
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import {
  assetUploadSchema,
  assetTypeSchema,
  isContentTypeAllowed,
  assetRepo,
  jobRepo,
  requireAuth,
  requireRole,
  type AssetType,
  type ProcessingMessage,
} from '@classquest/shared';
import { ApiError } from '../middleware.js';
import { storage, queue, metrics, config } from '../services.js';

export const assetsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

/** POST /assets — teacher uploads and publishes a learning asset. */
assetsRouter.post(
  '/',
  requireAuth,
  requireRole('teacher', 'admin'),
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const anyErr = err as { code?: string; message?: string };
        if (anyErr.code === 'LIMIT_FILE_SIZE') {
          return next(new ApiError(413, 'FILE_TOO_LARGE', 'Uploaded file exceeds the size limit'));
        }
        return next(new ApiError(400, 'UPLOAD_ERROR', anyErr.message ?? 'Upload failed'));
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = assetUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Missing or invalid title/type');
      }
      const file = req.file;
      if (!file) {
        throw new ApiError(400, 'NO_FILE', 'A file is required');
      }
      const { title, type, isDemo } = parsed.data;

      // File type allow-list (report 13).
      if (!isContentTypeAllowed(type, file.mimetype)) {
        throw new ApiError(
          400,
          'UNSUPPORTED_CONTENT_TYPE',
          `Content type ${file.mimetype} is not allowed for ${type}`,
        );
      }

      // 1) Store the binary in S3 (report 5.4.2).
      const key = storage.buildKey(type as AssetType, file.originalname);
      await storage.putObject(key, file.buffer, file.mimetype);

      // 2) Persist metadata in MySQL (status=submitted).
      const asset = await assetRepo.create({
        ownerId: req.user!.sub,
        title,
        type: type as AssetType,
        s3Key: key,
        s3Bucket: storage.bucketName,
        sizeBytes: file.size,
        contentType: file.mimetype,
        isDemo,
      });

      // 3) Create a job and enqueue it for async processing (report 3.7).
      const job = await jobRepo.create(asset.id);
      const message: ProcessingMessage = {
        jobId: job.id,
        assetId: asset.id,
        s3Bucket: asset.s3Bucket,
        s3Key: asset.s3Key,
        type: asset.type,
        induceFailure: req.query.induceFailure === 'true',
      };
      await queue.enqueue(message);
      await assetRepo.setStatus(asset.id, 'queued');
      await jobRepo.setState(job.id, 'queued');
      void metrics.incrementCounter('AssetsSubmitted');

      res.status(202).json({ assetId: asset.id, jobId: job.id, status: 'queued' });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /assets — list assets (optionally filtered by type). */
assetsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const typeParam = req.query.type;
    let filter: { type?: AssetType } | undefined;
    if (typeof typeParam === 'string') {
      const t = assetTypeSchema.safeParse(typeParam);
      if (!t.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid type filter');
      filter = { type: t.data };
    }
    const assets = await assetRepo.list(filter);
    res.json({ assets });
  } catch (err) {
    next(err);
  }
});

/** GET /assets/:id — metadata plus a presigned download URL (report 4.9.6). */
assetsRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await assetRepo.findById(req.params.id);
    if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Asset not found');
    // Report the live S3 tier (STANDARD vs GLACIER) for the UI (report 5.4.4).
    let currentTier = asset.storageClass;
    try {
      currentTier = await storage.headObjectTier(asset.s3Key);
    } catch {
      /* object may not exist yet in rare races; fall back to stored value */
    }
    const downloadUrl = await storage.getPresignedUrl(asset.s3Key);
    res.json({ asset: { ...asset, storageClass: currentTier }, downloadUrl });
  } catch (err) {
    next(err);
  }
});

/** GET /assets/:id/job — current job state for this asset's processing. */
assetsRouter.get('/:id/job', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await assetRepo.findById(req.params.id);
    if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Asset not found');
    res.json({ status: asset.status });
  } catch (err) {
    next(err);
  }
});
