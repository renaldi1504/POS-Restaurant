import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Card, EmptyState, HeaderBar } from '../components/ui';

/**
 * Placeholder layar — agen pos-web mengganti isi file halaman masing-masing.
 * `mockup` = file di docs/mockups yang menjadi acuan desain.
 */
export function Placeholder({
  title,
  mockup,
  back,
  testId,
}: {
  title: string;
  mockup: string;
  back?: string;
  testId?: string;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col" data-testid={testId}>
      <HeaderBar
        title={title}
        onBack={back ? () => navigate(back) : undefined}
        backLabel={t('common.back')}
      />
      <main className="flex grow flex-col gap-3 p-4">
        <Card>
          <EmptyState title={title} description={`Acuan desain: docs/mockups/${mockup}`} />
        </Card>
      </main>
    </div>
  );
}
