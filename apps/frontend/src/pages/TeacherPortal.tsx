import { useEffect, useState, useCallback } from 'react';
import { api, type Asset, type ApiError } from '../api';
import { StatusBadge, TierBadge } from '../components/AssetCard';

interface TrackedJob {
  jobId: string;
  assetId: string;
  title: string;
  state: string;
  attempts: number;
  error: string | null;
}

/**
 * Teacher Portal — upload & publish a learning asset, then watch the async
 * pipeline move it submitted -> queued -> processing -> completed/failed
 * (the primary workflow, report 3.7, FR-2/5).
 */
export function TeacherPortal() {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('document');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracked, setTracked] = useState<TrackedJob[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  const loadAssets = useCallback(async () => {
    const { assets } = await api.listAssets();
    setAssets(assets);
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  // Poll tracked jobs until they reach a terminal state.
  useEffect(() => {
    if (tracked.length === 0) return;
    const active = tracked.some((j) => j.state !== 'completed' && j.state !== 'failed');
    if (!active) return;
    const t = setInterval(async () => {
      const updated = await Promise.all(
        tracked.map(async (j) => {
          if (j.state === 'completed' || j.state === 'failed') return j;
          try {
            const s = await api.getJob(j.jobId);
            return { ...j, state: s.state, attempts: s.attempts, error: s.error };
          } catch {
            return j;
          }
        }),
      );
      setTracked(updated);
      void loadAssets();
    }, 2000);
    return () => clearInterval(t);
  }, [tracked, loadAssets]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title) {
      setError('Title and file are required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('title', title);
      form.append('type', type);
      form.append('file', file);
      const r = await api.uploadAsset(form);
      setTracked((prev) => [
        { jobId: r.jobId, assetId: r.assetId, title, state: r.status, attempts: 0, error: null },
        ...prev,
      ]);
      setTitle('');
      setFile(null);
      (document.getElementById('file-input') as HTMLInputElement).value = '';
      void loadAssets();
    } catch (err) {
      setError((err as ApiError).message ?? 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Teacher Portal</h1>
        <p>Publish a learning resource. It is stored in Amazon S3 and processed asynchronously through Amazon SQS.</p>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Publish a resource</h3>
          <form onSubmit={submit}>
            <div className="field">
              <label>Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Year 8 Algebra Notes" />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="document">Document (PDF / text)</option>
                <option value="book">Digital book (PDF / EPUB)</option>
                <option value="video">Video (MP4 / WebM)</option>
              </select>
            </div>
            <div className="field">
              <label>File</label>
              <input id="file-input" className="input" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <button className="btn" disabled={busy}>{busy ? 'Uploading…' : 'Upload & publish'}</button>
            {error && <div className="err-text">{error}</div>}
          </form>
        </div>

        <div className="card">
          <h3>Processing pipeline (live)</h3>
          {tracked.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              Uploads appear here and update in real time as the worker processes them.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Resource</th><th>State</th><th>Attempts</th></tr>
              </thead>
              <tbody>
                {tracked.map((j) => (
                  <tr key={j.jobId}>
                    <td>{j.title}</td>
                    <td><StatusBadge status={j.state} />{j.error && <div className="err-text">{j.error}</div>}</td>
                    <td>{j.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Published resources ({assets.length})</h3>
        <table className="table">
          <thead>
            <tr><th>Title</th><th>Type</th><th>Status</th><th>Tier</th><th>Size</th></tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td>{a.title} {a.isDemo && <span className="badge demo">Demo</span>}</td>
                <td style={{ textTransform: 'capitalize' }}>{a.type}</td>
                <td><StatusBadge status={a.status} /></td>
                <td><TierBadge tier={a.storageClass} /></td>
                <td>{(a.sizeBytes / 1024).toFixed(1)} KB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
