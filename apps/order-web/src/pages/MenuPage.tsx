import { useTranslation } from 'react-i18next';
import type { CustomerMode, Lang } from '@pos/shared';
import { Card, EmptyState, HeaderBar, LangSwitcher } from '../components/ui';
import { setLang } from '../lib/i18n';

/**
 * Menu pelanggan — acuan: docs/mockups/Website.dc.html (mode biasa/telegram) & WebsiteMeja.dc.html (mode meja),
 * lembar opsi: ItemOpsi.dc.html. Mode ditentukan oleh route: `/` (none), `/tg` (telegram), `/m/:qrToken` (table).
 */
export default function MenuPage({ mode }: { mode: CustomerMode }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col" data-testid="order-menu" data-mode={mode}>
      <HeaderBar
        title={t('common.menu')}
        right={<LangSwitcher value={i18n.language as Lang} onChange={setLang} label={t('common.language')} />}
      />
      <main className="flex grow flex-col gap-3 p-4">
        <Card>
          <EmptyState title={t('order.searchPlaceholder')} description={`mode: ${mode}`} />
        </Card>
      </main>
    </div>
  );
}
