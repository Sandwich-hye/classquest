/** Domain types for ClassQuest assets and processing jobs. */

export type UserRole = 'student' | 'teacher' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  createdAt: string;
}

/** Asset types map to the report's S3 key prefixes (report 5.4.2). */
export type AssetType = 'document' | 'book' | 'video';

/** S3 prefix for each asset type (report 5.4.2: documents/ pictures/ videos/). */
export const ASSET_PREFIX: Record<AssetType, string> = {
  document: 'documents',
  book: 'documents', // digital books stored alongside documents
  video: 'videos',
};

/** S3 storage class as reported by the lifecycle tiering (report 5.4.4). */
export type StorageClass = 'STANDARD' | 'GLACIER';

/** Job lifecycle states (report 3.7). */
export type JobState =
  | 'submitted'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface Asset {
  id: string;
  ownerId: string;
  title: string;
  type: AssetType;
  s3Key: string;
  s3Bucket: string;
  sizeBytes: number;
  contentType: string;
  storageClass: StorageClass;
  status: JobState;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  assetId: string;
  state: JobState;
  attempts: number;
  lastError: string | null;
  submittedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** Message body enqueued to SQS for the worker. */
export interface ProcessingMessage {
  jobId: string;
  assetId: string;
  s3Bucket: string;
  s3Key: string;
  type: AssetType;
  /** When true, the worker deliberately fails to demonstrate retry + DLQ. */
  induceFailure?: boolean;
}
