/**
 * API client. All calls go through the Web Tier under /api/* (the single
 * public entry point, report 2.3.5). The JWT is attached as a bearer token.
 */
const BASE = '/api';

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('cq_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = (body.error as ApiError) ?? { code: 'ERROR', message: res.statusText };
    throw err;
  }
  return body as T;
}

export const api = {
  async login(email: string, password: string) {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return handle<{ token: string; role: string; displayName: string }>(res);
  },

  async listAssets(type?: string) {
    const q = type ? `?type=${encodeURIComponent(type)}` : '';
    const res = await fetch(`${BASE}/assets${q}`, { headers: { ...authHeader() } });
    return handle<{ assets: Asset[] }>(res);
  },

  async getAsset(id: string) {
    const res = await fetch(`${BASE}/assets/${id}`, { headers: { ...authHeader() } });
    return handle<{ asset: Asset; downloadUrl: string }>(res);
  },

  async uploadAsset(form: FormData) {
    const res = await fetch(`${BASE}/assets`, {
      method: 'POST',
      headers: { ...authHeader() },
      body: form,
    });
    return handle<{ assetId: string; jobId: string; status: string }>(res);
  },

  async getJob(id: string) {
    const res = await fetch(`${BASE}/jobs/${id}`, { headers: { ...authHeader() } });
    return handle<JobStatus>(res);
  },

  async dashboard() {
    const res = await fetch(`${BASE}/dashboard/metrics`, { headers: { ...authHeader() } });
    return handle<DashboardMetrics>(res);
  },

  async health() {
    const res = await fetch(`${BASE}/health`);
    return handle<HealthStatus>(res);
  },

  // --- demo mode ---
  async demoSeed() {
    const res = await fetch(`${BASE}/demo/seed`, { method: 'POST' });
    return handle<DemoSeedResult>(res);
  },
  async demoInduceFailure() {
    const res = await fetch(`${BASE}/demo/induce-failure`, { method: 'POST' });
    return handle<{ assetId: string; jobId: string; maxAttempts: number }>(res);
  },
  async demoLifecycleSimulate() {
    const res = await fetch(`${BASE}/demo/lifecycle-simulate`, { method: 'POST' });
    return handle<{ transitionedCount: number; transitioned: string[] }>(res);
  },
  /** Fire N intentional 400s through the edge to trip the HTTP-400 alarm. */
  async demo400Burst(count = 60): Promise<number> {
    let sent = 0;
    const batch = Array.from({ length: count }, () =>
      fetch(`${BASE}/demo/bad-request`, { method: 'POST' }).then(() => { sent += 1; }).catch(() => undefined),
    );
    await Promise.all(batch);
    return sent;
  },
};

// ---- types mirrored from the backend ----
export interface Asset {
  id: string;
  ownerId: string;
  title: string;
  type: 'document' | 'book' | 'video';
  s3Key: string;
  sizeBytes: number;
  contentType: string;
  storageClass: 'STANDARD' | 'GLACIER';
  status: 'submitted' | 'queued' | 'processing' | 'completed' | 'failed';
  isDemo: boolean;
  createdAt: string;
}

export interface JobStatus {
  id: string;
  state: 'submitted' | 'queued' | 'processing' | 'completed' | 'failed';
  attempts: number;
  error: string | null;
}

export interface DashboardMetrics {
  requests: {
    total: number; success: number; clientErrors: number; serverErrors: number;
    avgLatencyMs: number; http400LastMinute: number;
  };
  jobs: {
    byStatus: Record<string, number>; active: number; avgProcessingMs: number; queueDepth: number;
  };
  storage: { byTier: Record<string, number>; bucket: string };
  alerting: { http400AlarmState: string; threshold: number; periodSeconds: number };
  meta: { note: string; region: string; cloudTarget: string };
}

export interface HealthStatus {
  tier: string;
  status: 'healthy' | 'degraded';
  cloudTarget: string;
  region: string;
  dependencies: Record<string, boolean>;
}

export interface DemoSeedResult {
  message: string;
  assets: Array<{ assetId: string; jobId: string; title: string }>;
  credentials: Array<{ email: string; password: string; role: string }>;
}
