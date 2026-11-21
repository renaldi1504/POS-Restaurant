import { useTranslation } from 'react-i18next';
import { Button, Card, EmptyState, HeaderBar } from '../../components/ui';
import { useAuthActions, useMe } from '../../lib/auth';

/** Kasir – pilih menu (layar utama kasir) — acuan: docs/mockups/Main.dc.html. */
export default function CashierPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const { logout } = useAuthActions();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col" data-testid="cashier-screen">
      <HeaderBar
        title={t('cashier.title')}
        subtitle={me?.name}
        right={
          <Button variant="outline" size="md" onClick={() => void logout()}>
            {t('common.logout')}
          </Button>
        }
      />
      <main className="flex grow flex-col gap-3 p-4">
        <Card>
          <EmptyState title={t('cashier.title')} description="Acuan desain: docs/mockups/Main.dc.html" />
        </Card>
      </main>
    </div>
  );
}
