import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  assetUploadSchema,
  isContentTypeAllowed,
} from '../../packages/shared/src/domain/schemas.js';
import { ASSET_PREFIX } from '../../packages/shared/src/domain/types.js';

describe('validation schemas (report 13 / 12.4)', () => {
  describe('loginSchema', () => {
    it('accepts a valid credential pair', () => {
      const r = loginSchema.safeParse({ email: 'a@b.com', password: 'secret' });
      expect(r.success).toBe(true);
    });
    it('rejects a malformed email', () => {
      expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
    });
    it('rejects an empty password', () => {
      expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
    });
  });

  describe('assetUploadSchema', () => {
    it('accepts valid metadata and coerces isDemo', () => {
      const r = assetUploadSchema.safeParse({ title: 'T', type: 'document', isDemo: 'true' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.isDemo).toBe(true);
    });
    it('rejects an unknown asset type', () => {
      expect(assetUploadSchema.safeParse({ title: 'T', type: 'spreadsheet' }).success).toBe(false);
    });
    it('rejects an empty title', () => {
      expect(assetUploadSchema.safeParse({ title: '', type: 'video' }).success).toBe(false);
    });
  });

  describe('isContentTypeAllowed (file allow-list)', () => {
    it('allows PDF for documents and books', () => {
      expect(isContentTypeAllowed('document', 'application/pdf')).toBe(true);
      expect(isContentTypeAllowed('book', 'application/pdf')).toBe(true);
    });
    it('allows mp4 for video', () => {
      expect(isContentTypeAllowed('video', 'video/mp4')).toBe(true);
    });
    it('blocks disallowed types', () => {
      expect(isContentTypeAllowed('document', 'application/x-msdownload')).toBe(false);
      expect(isContentTypeAllowed('video', 'text/plain')).toBe(false);
    });
  });

  describe('ASSET_PREFIX (report 5.4.2)', () => {
    it('maps asset types to S3 key prefixes', () => {
      expect(ASSET_PREFIX.document).toBe('documents');
      expect(ASSET_PREFIX.book).toBe('documents');
      expect(ASSET_PREFIX.video).toBe('videos');
    });
  });
});
