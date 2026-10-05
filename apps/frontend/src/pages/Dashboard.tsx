import { useEffect, useState, useCallback } from 'react';
import { api, type DashboardMetrics, type HealthStatus } from '../api';

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/**
 * Admin Dashboard (report 7, 15; FR-9/10/12). Every number here is measured
 * from the running prototype — no fabricated statistics (brief §20).
 */
export function Dashboard() {
  const [m, setM] = useState<DashboardMetrics | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [metrics, h] = await Promise.all([api.dashboard().catch(() => null), api.health().catch(() => null)]);
    if (metrics) setM(metrics);
    if (h) setHealth(h);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function run(name: string, fn: () => Promise<string>) {
    setBusy(name);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      void load();
    }
  }

  const alarm = m?.alerting.http400AlarmState ?? 'UNKNOWN';
  const alarmClass = alarm === 'ALARM' ? 'alarm' : alarm === 'OK' ? 'ok' : 'info';

  return (
    <>
      <div className="page-head">
        <h1>Operations Dashboard</h1>
        <p>Live cloud metrics for the ClassQuest platform. {m?.meta.note}</p>
      </div>

      {/* HTTP-400 alarm banner (report 2.2.8 / 7.7) */}
      <div className={`alert-banner ${alarmClass}`}>
        <b>HTTP 400 alarm:</b> {alarm}
        {m && (
          <> — threshold &gt; {m.alerting.threshold} per {m.alerting.periodSeconds}s · last minute: {m.requests.http400LastMinute} ×400</>
        )}
      </div>

      <div className="grid cols-4">
        <Stat label="Requests processed" value={m?.requests.total ?? '—'} />
        <Stat label="Successful" value={m?.requests.success ?? '—'} sub="2xx / 3xx responses" />
        <Stat label="Client/Server errors" value={(m ? m.requests.clientErrors + m.requests.serverErrors : '—') as number | string} />
        <Stat label="Avg latency" value={m ? `${m.requests.avgLatencyMs} ms` : '—'} />
      </div>

      <div className="grid cols-4" style={{ marginTop: 18 }}>
        <Stat label="Active jobs" value={m?.jobs.active ?? '—'} sub="submitted/queued/processing" />
        <Stat label="Queue depth" value={m?.jobs.queueDepth ?? '—'} sub="Amazon SQS" />
        <Stat label="Avg processing time" value={m ? `${m.jobs.avgProcessingMs} ms` : '—'} />
        <Stat label="Completed" value={m?.jobs.byStatus.completed ?? '—'} />
      </div>

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <div className="card">
          <h3>Job states</h3>
          <table className="table">
            <tbody>
              {m &&
                Object.entries(m.jobs.byStatus).map(([k, v]) => (
                  <tr key={k}>
                    <td><span className={`badge ${k}`}>{k}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Storage tiers (S3 lifecycle)</h3>
          <table className="table">
            <tbody>
              {m &&
                Object.entries(m.storage.byTier).map(([k, v]) => (
                  <tr key={k}>
                    <td><span className={`badge ${k.toLowerCase()}`}>{k}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="notice">Standard → Glacier after 90 days (simulated on demand below).</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <div className="card">
          <h3>System status</h3>
          {health ? (
            <>
              <div style={{ marginBottom: 10 }}>
                <span className={`dot ${health.status === 'healthy' ? 'ok' : 'bad'}`} />
                Application tier: <b>{health.status}</b> · {health.cloudTarget} · {health.region}
              </div>
              <table className="table">
                <tbody>
                  {Object.entries(health.dependencies).map(([dep, ok]) => (
                    <tr key={dep}>
                      <td><span className={`dot ${ok ? 'ok' : 'bad'}`} />{dep.toUpperCase()}</td>
                      <td style={{ textAlign: 'right' }}>{ok ? 'healthy' : 'down'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p>Loading…</p>
          )}
        </div>

        <div className="card">
          <h3>Demonstration controls</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Drive the architecture live. All produced data is labelled DEMO/SAMPLE.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn ghost" disabled={!!busy} onClick={() => run('seed', async () => {
              const r = await api.demoSeed();
              return `Seeded ${r.assets.length} sample assets.`;
            })}>Seed demo data</button>

            <button className="btn amber" disabled={!!busy} onClick={() => run('fail', async () => {
              const r = await api.demoInduceFailure();
              return `Enqueued induced-failure job (expect retries → DLQ, max ${r.maxAttempts} attempts).`;
            })}>Induce failure → DLQ</button>

            <button className="btn secondary" disabled={!!busy} onClick={() => run('glacier', async () => {
              const r = await api.demoLifecycleSimulate();
              return `Transitioned ${r.transitionedCount} asset(s) to GLACIER.`;
            })}>Simulate Glacier tiering</button>

            <button className="btn" style={{ background: 'var(--danger)' }} disabled={!!busy} onClick={() => run('burst', async () => {
              const n = await api.demo400Burst(60);
              return `Fired ${n} HTTP 400s — watch the alarm flip to ALARM within ~1 min.`;
            })}>Trigger HTTP-400 burst</button>
          </div>
          {busy && <div className="notice">Running {busy}…</div>}
          {msg && <div className="alert-banner info" style={{ marginTop: 12 }}>{msg}</div>}
        </div>
      </div>

      <div className="notice" style={{ marginTop: 16 }}>
        Region {m?.meta.region} · cloud target {m?.meta.cloudTarget} · all values measured from the running prototype.
      </div>
    </>
  );
}
