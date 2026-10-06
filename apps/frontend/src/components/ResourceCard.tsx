import { useState } from 'react';
import { api, type Asset } from '../api';
import { fileKind, formatBytes, formatDate, TYPE_LABEL } from '../lib/assets';
import { Badge, Button, Icon, STATUS_TONE } from './ui';

interface ResourceCardProps {
  asset: Asset;
  /** Teachers/admins see pipeline status and S3 storage tier. */
  showPipeline: boolean;
}

/**
 * Library card. Shows only real or derived information: type, title, demo
 * flag, created date, size, and — for staff — status and storage tier. The
 * thumbnail is a type-coloured placeholder (no real thumbnails exist).
 */
export function ResourceCard({ asset, showPipeline }: ResourceCardProps) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = asset.status === 'completed';

  async function open() {
    setOpening(true);
    setError(null);
    // Open the tab synchronously (inside the click) so popup blockers allow
    // it, then point it at the presigned URL once the API returns.
    const tab = window.open('about:blank', '_blank');
    try {
      const { downloadUrl } = await api.getAsset(asset.id);
      if (tab) {
        tab.opener = null;
        tab.location.href = downloadUrl;
      } else {
        window.location.assign(downloadUrl);
      }
    } catch {
      tab?.close();
      setError('Could not open this resource. Please try again.');
    } finally {
      setOpening(false);
    }
  }

  const unavailableLabel =
    asset.status === 'failed' ? 'Processing failed' : asset.status === 'processing' ? 'Processing…' : 'Waiting to process';

  return (
    <article className="cq-resource">
      <div className={`cq-resource__thumb cq-resource__thumb--${asset.type}`} aria-hidden="true">
        <Icon name={asset.type} size={34} />
        <span className="cq-resource__kind">{fileKind(asset.contentType)}</span>
      </div>

      <div className="cq-resource__body">
        <div className="cq-resource__tags">
          <Badge tone="info" upper>{TYPE_LABEL[asset.type]}</Badge>
          {asset.isDemo && <Badge tone="warning" upper>Demo</Badge>}
        </div>

        <h3 className="cq-resource__title">{asset.title}</h3>

        <p className="cq-resource__meta">
          <span>Added {formatDate(asset.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatBytes(asset.sizeBytes)}</span>
        </p>

        {showPipeline && (
          <div className="cq-resource__status">
            <Badge tone={STATUS_TONE[asset.status] ?? 'neutral'} upper>{asset.status}</Badge>
            <Badge tone={asset.storageClass === 'GLACIER' ? 'neutral' : 'callout'} upper>
              {asset.storageClass === 'GLACIER' ? 'Glacier tier' : 'Standard tier'}
            </Badge>
          </div>
        )}

        <div className="cq-resource__actions">
          <Button
            block
            variant={ready ? 'primary' : 'secondary'}
            iconRight={ready ? 'external' : undefined}
            onClick={open}
            disabled={!ready || opening}
            title={ready ? 'Open via a time-limited S3 link' : 'Available once processing completes'}
          >
            {opening ? 'Opening…' : ready ? 'Open Resource' : unavailableLabel}
          </Button>
        </div>
        {error && (
          <p className="cq-resource__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
