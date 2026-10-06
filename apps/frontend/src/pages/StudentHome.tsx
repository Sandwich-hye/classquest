import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ApiError, type Asset, type StudentProgress } from '../api';
import { useAuth } from '../auth';
import { fileKind, formatBytes, searchAndSort, TYPE_LABEL } from '../lib/assets';
import { useOpenResource } from '../lib/openResource';
import { cleanName, coveragePercent, formatRelative } from '../lib/progress';
import { PageHeader } from '../components/shell/PageHeader';
import { ResourceCard } from '../components/ResourceCard';
import { Badge, Button, Card, EmptyState, Icon, ProgressBar, StatCard } from '../components/ui';

const HOW_IT_WORKS = [
  { title: 'Browse resources', body: 'Find documents, books and videos your teachers have published in the Library.', icon: 'library' as const },
  { title: 'Open learning materials', body: 'Each resource opens through a secure, time-limited link.', icon: 'external' as const },
  { title: 'See what you have opened', body: 'Resources you open appear in My Progress, so you can pick them up again.', icon: 'progress' as const },
];

/**
 * Student Home. Real data only: the student's opens from GET /me/progress and
 * the newest completed resources from GET /assets.
 */
export function StudentHome() {
  const { session } = useAuth();
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [latest, setLatest] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, a] = await Promise.allSettled([api.progress(), api.listAssets()]);
    if (p.status === 'fulfilled') setProgress(p.value);
    if (a.status === 'fulfilled') setLatest(searchAndSort(a.value.assets, '', 'newest').slice(0, 3));
    const failed = [p, a].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    setError(failed ? ((failed.reason as ApiError)?.message ?? 'Some information could not be loaded') : null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { open, openingId, errorId } = useOpenResource(() => void load());
  const last = progress?.recent[0];
  const name = session ? cleanName(session.displayName) : '';

  return (
    <>
      <PageHeader
        eyebrow="Learning portal"
        title={`Welcome back, ${name}`}
        description="Pick up where you left off, or explore what's new in the library."
      />

      {error && <p className="cq-stale" role="status">{error}</p>}

      <div className="cq-home-top">
        <Card className="cq-continue" title="Continue where you left off" subtitle="The resource you opened most recently.">
          {!progress ? (
            <p className="cq-small">Loading…</p>
          ) : !last ? (
            <EmptyState
              icon="library"
              title="You haven't opened any resources yet"
              description="Browse the Library and open a resource — it will appear here next time."
              action={<Link className="cq-btn cq-btn--primary" to="/library">Go to Library</Link>}
            />
          ) : (
            <div className="cq-continue__item">
              <div className={`cq-continue__thumb cq-resource__thumb--${last.asset.type}`} aria-hidden="true">
                <Icon name={last.asset.type} size={36} />
              </div>
              <div className="cq-continue__body">
                <div className="cq-resource__tags">
                  <Badge tone="info" upper>{TYPE_LABEL[last.asset.type]}</Badge>
                  {last.asset.isDemo && <Badge tone="warning" upper>Demo</Badge>}
                </div>
                <h3 className="cq-continue__title">{last.asset.title}</h3>
                <p className="cq-small">
                  {fileKind(last.asset.contentType)} · {formatBytes(last.asset.sizeBytes)} · Last opened {formatRelative(last.lastOpenedAt)}
                </p>
                <div>
                  <Button iconRight="external" onClick={() => void open(last.asset.id)} disabled={openingId === last.asset.id}>
                    {openingId === last.asset.id ? 'Opening…' : 'Open again'}
                  </Button>
                </div>
                {errorId === last.asset.id && <p className="cq-resource__error" role="alert">Could not open this resource. Please try again.</p>}
              </div>
            </div>
          )}
        </Card>

        <Card
          className="cq-home-summary"
          title="Your library activity"
          action={<Link className="cq-btn cq-btn--link" to="/progress">My Progress</Link>}
        >
          {!progress ? (
            <p className="cq-small">Loading…</p>
          ) : (
            <>
              <div className="cq-mini-stats cq-mini-stats--two">
                <StatCard label="Opened" value={progress.opened} unit={progress.opened === 1 ? 'resource' : 'resources'} tone="primary" icon="external" />
                <StatCard label="Available" value={progress.available} unit={progress.available === 1 ? 'resource' : 'resources'} tone="callout" icon="library" />
              </div>
              <div className="cq-home-summary__coverage">
                <span className="cq-small">Library coverage</span>
                <ProgressBar value={coveragePercent(progress.opened, progress.available)} showLabel label="Library coverage" />
              </div>
              <p className="cq-small">Counts resources you have opened — not grades or lesson completion.</p>
            </>
          )}
        </Card>
      </div>

      <section className="cq-ops-section" aria-labelledby="new-title">
        <div className="cq-section-head">
          <h2 id="new-title" className="cq-section-title">New in Library</h2>
          <Link className="cq-btn cq-btn--link" to="/library">View all</Link>
        </div>
        {!latest ? (
          <p className="cq-small">Loading…</p>
        ) : latest.length === 0 ? (
          <Card>
            <EmptyState icon="library" title="No resources yet" description="Resources appear here once your teachers publish them." />
          </Card>
        ) : (
          <div className="cq-resource-grid">
            {latest.map((a) => (
              <ResourceCard key={a.id} asset={a} showPipeline={false} onOpened={() => void load()} />
            ))}
          </div>
        )}
      </section>

      <Card variant="callout" title="How ClassQuest works">
        <ol className="cq-steps">
          {HOW_IT_WORKS.map((s, i) => (
            <li key={s.title} className="cq-steps__item">
              <span className="cq-steps__num" aria-hidden="true">{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <p className="cq-small">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
