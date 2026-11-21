/** Tagihan meja — acuan: docs/mockups/WebsiteMeja.dc.html. */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { BootErrorScreen, ErrorBlock, LoadingBlock, Page } from '../components/Shell';
import { TableBill } from '../components/TableBill';
import { Button, Card, EmptyState, HeaderBar } from '../components/ui';
import { useCustomer } from '../lib/customer';
import { useTableBill } from '../lib/table';

export default function TableBillPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const customer = useCustomer();
  const bill = useTableBill();
  if (customer.status === 'error') return <BootErrorScreen />;
  return (
    <Page testId="table-bill-page">
      <HeaderBar
        title={t('web.bill')}
        subtitle={customer.session?.table?.name}
        onBack={() => navigate(customer.homePath)}
        backLabel={t('web.backToMenu')}
      />
      <main className="flex grow flex-col gap-3 p-4">
        {customer.mode !== 'table' ? (
          <Card>
            <EmptyState
              title={t('order.emptyCart')}
              action={<Button onClick={() => navigate('/')}>{t('web.seeMenu')}</Button>}
            />
          </Card>
        ) : bill.isPending ? (
          <LoadingBlock />
        ) : bill.isError || !bill.data ? (
          <ErrorBlock message={t('web.loadFailed')} onRetry={() => void bill.refetch()} />
        ) : bill.data.orders.length === 0 ? (
          <Card>
            <EmptyState
              title={t('web.tableNoBill')}
              action={<Button onClick={() => navigate(customer.homePath)}>{t('web.seeMenu')}</Button>}
            />
          </Card>
        ) : (
          <TableBill bill={bill.data} />
        )}
        <Button variant="outline" block onClick={() => navigate(customer.homePath)}>
          {t('order.orderAgain')}
        </Button>
      </main>
    </Page>
  );
}
