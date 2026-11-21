import { Card, EmptyState, HeaderBar } from '../components/ui';

/** Placeholder layar — agen order-web mengganti isi file halaman masing-masing. */
export function Placeholder({ title, mockup, testId }: { title: string; mockup: string; testId?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col" data-testid={testId}>
      <HeaderBar title={title} />
      <main className="flex grow flex-col gap-3 p-4">
        <Card>
          <EmptyState title={title} description={`Acuan desain: docs/mockups/${mockup}`} />
        </Card>
      </main>
    </div>
  );
}
