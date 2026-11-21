/** Pratinjau nota sementara meja — acuan: docs/mockups/Nota.dc.html. */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui';
import { ErrorBlock, LoadingBlock, ReceiptPreview, Screen, ScreenFooter, TopBar, usePrint } from '../../components/common';
import { api, qk } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { useMoney, usePublicSettings } from '../../lib/data';
import { usePrefs } from '../../lib/prefs';
import { receiptFromBill } from '../../lib/receiptData';

export default function TempBillPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tableId = Number(useParams().tableId);
  const q = useQuery({ queryKey: qk.tableBill(tableId), queryFn: () => api.call('tableSession', { params: { id: tableId } }) });
  const settings = usePublicSettings();
  const money = useMoney();
  const prefs = usePrefs();
  const { data: me } = useMe();
  const print = usePrint();
  if (q.isLoading) return <LoadingBlock />;
  const bill = q.data;
  const data = bill ? receiptFromBill(bill, { shop: settings.data, money, lang: prefs.receiptLang, cashier: me?.name }, 'provisional') : null;
  return (
    <Screen testId="temp-bill-screen" className="bg-[#EEF0F3]">
      <TopBar
        back={{ label: bill?.table.name ?? t('tables.title'), onClick: () => navigate(`/kasir/meja/${tableId}`) }}
        title={t('meja.notePreview')}
        right={<span className="text-xs text-muted">{prefs.paper === 58 ? t('printer.paper58') : t('printer.paper80')}</span>}
      />
      <main className="flex min-h-0 grow justify-center overflow-y-auto py-4">
        {q.isError ? <ErrorBlock error={q.error} /> : null}
        {data ? <ReceiptPreview data={data} /> : null}
      </main>
      <ScreenFooter>
        <span className="text-center text-xs text-muted">
          {print.status.connected ? t('print.statusOn', { name: print.status.name ?? '' }) : t('printer.disconnected')}
        </span>
        <div className="flex gap-2.5">
          <button type="button" onClick={() => navigate(`/kasir/bayar?tableId=${tableId}`)} className="h-14 w-[120px] rounded-[14px] border border-line-strong bg-white text-[15px] font-extrabold">
            {t('meja.toPay')}
          </button>
          <Button className="grow text-lg" disabled={!data} loading={print.status.busy} onClick={() => data && void print.printReceipt(data)}>
            {t('meja.printNote')}
          </Button>
        </div>
      </ScreenFooter>
    </Screen>
  );
}
