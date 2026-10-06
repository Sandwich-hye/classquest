import { PageHeader } from '../components/shell/PageHeader';
import { Card, EmptyState } from '../components/ui';

/** Temporary page for routes whose content is built in a later phase. */
export function Placeholder({ title, eyebrow, description }: { title: string; eyebrow?: string; description: string }) {
  return (
    <>
      <PageHeader title={title} eyebrow={eyebrow} description={description} />
      <Card>
        <EmptyState
          icon="lock"
          title="Coming in a later phase"
          description="This page is part of the redesign plan and has not been built yet. Navigation and access rules are already in place."
        />
      </Card>
    </>
  );
}
