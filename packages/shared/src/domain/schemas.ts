/**
 * Input validation schemas (zod). Every external input is validated before
 * use (report 13 error handling, 12.4 security validation).
 */
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const assetTypeSchema = z.enum(['document', 'book', 'video']);

/** Multipart text fields accompanying an upload (the file is validated separately). */
export const assetUploadSchema = z.object({
  title: z.string().min(1).max(200),
  type: assetTypeSchema,
  isDemo: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === true || v === 'true'),
});
export type AssetUploadInput = z.infer<typeof assetUploadSchema>;

/** Allowed MIME types per asset type (file type allow-list, report 13). */
export const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  document: ['application/pdf', 'text/plain', 'application/msword', 'text/markdown'],
  book: ['application/pdf', 'application/epub+zip'],
  video: ['video/mp4', 'video/webm', 'application/octet-stream'],
};

export function isContentTypeAllowed(type: string, contentType: string): boolean {
  const allowed = ALLOWED_CONTENT_TYPES[type];
  return allowed ? allowed.includes(contentType) : false;
}
