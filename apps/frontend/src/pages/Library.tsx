import { useEffect, useState, useCallback } from 'react';
import { api, type Asset } from '../api';
import { AssetCard } from '../components/AssetCard';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'document', label: 'Documents' },
  { key: 'book', label: 'Books' },
  { key: 'video', label: 'Videos' },
];

/** Student Library view — browse and open published learning assets (FR-7). */
export function Library() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { assets } = await api.listAssets(filter || undefined);
      setAssets(assets);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 4000); // reflect processing state changes
    return () => clearInterval(t);
  }, [load]);

  return (
    <>
      <div className="page-head">
        <h1>Learning Library</h1>
        <p>Curated documents, books and videos shared by your teachers. Retrieved securely from Amazon S3 via presigned links.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`btn ${filter === f.key ? '' : 'ghost'}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && assets.length === 0 ? (
        <div className="card">Loading…</div>
      ) : assets.length === 0 ? (
        <div className="card">No assets yet. Ask a teacher to publish one, or seed demo data from the login screen.</div>
      ) : (
        <div className="grid cols-3">
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} />
          ))}
        </div>
      )}
    </>
  );
}
