import { useState } from 'react';
import { api, type Asset } from '../api';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

export function TierBadge({ tier }: { tier: string }) {
  return <span className={`badge ${tier.toLowerCase()}`}>{tier}</span>;
}

const TYPE_LABEL: Record<string, string> = { document: 'Document', book: 'Digital Book', video: 'Video' };

export function AssetCard({ asset }: { asset: Asset }) {
  const [opening, setOpening] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open() {
    setOpening(true);
    setErr(null);
    try {
      const { downloadUrl } = await api.getAsset(asset.id);
      window.open(downloadUrl, '_blank');
    } catch {
      setErr('Could not generate download link');
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span className="badge standard">{TYPE_LABEL[asset.type] ?? asset.type}</span>
        {asset.isDemo && <span className="badge demo">Demo/Sample</span>}
      </div>
      <div style={{ fontWeight: 600, fontSize: 15, minHeight: 40 }}>{asset.title}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
        <StatusBadge status={asset.status} />
        <TierBadge tier={asset.storageClass} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        {(asset.sizeBytes / 1024).toFixed(1)} KB · {new Date(asset.createdAt).toLocaleString()}
      </div>
      <button
        className="btn"
        style={{ width: '100%' }}
        onClick={open}
        disabled={opening || asset.status !== 'completed'}
        title={asset.status !== 'completed' ? 'Available once processing completes' : 'Open'}
      >
        {opening ? 'Opening…' : asset.status === 'completed' ? 'Open resource' : `Processing (${asset.status})`}
      </button>
      {err && <div className="err-text">{err}</div>}
    </div>
  );
}
