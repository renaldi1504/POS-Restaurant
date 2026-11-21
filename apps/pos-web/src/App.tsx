import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ListDetail } from './components/common/Layout';
import { Icon } from './components/ui';
import { useWindowSizeClass } from './lib/windowSize';
import type { PermissionKey } from '@pos/shared';
import { RequireAuth, UnauthorizedListener } from './lib/auth';
import { ConnectionBanner } from './components/common/ConnectionBanner';
import { NavUsageTracker } from './components/common/NavigationBar';
import { RealtimeBridge, TextSizeSync, useCurrentShift } from './lib/data';
import { reconnectPrinter } from './lib/printer';
import LoginPage from './pages/LoginPage';

const CashierPage = lazy(() => import('./pages/cashier/CashierPage'));
const OrderDetailPage = lazy(() => import('./pages/cashier/OrderDetailPage'));
const PaymentPage = lazy(() => import('./pages/cashier/PaymentPage'));
const OnlineOrdersPage = lazy(() => import('./pages/cashier/OnlineOrdersPage'));
const TablesPage = lazy(() => import('./pages/cashier/TablesPage'));
const TableBillPage = lazy(() => import('./pages/cashier/TableBillPage'));
const TempBillPage = lazy(() => import('./pages/cashier/TempBillPage'));
const ExpensesPage = lazy(() => import('./pages/cashier/ExpensesPage'));
const ClosingPage = lazy(() => import('./pages/cashier/ClosingPage'));
const OpenShiftPage = lazy(() => import('./pages/shift/OpenShiftPage'));
const KitchenPage = lazy(() => import('./pages/kitchen/KitchenPage'));
const DriverPage = lazy(() => import('./pages/driver/DriverPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const MenuListPage = lazy(() => import('./pages/admin/MenuListPage'));
const MenuEditPage = lazy(() => import('./pages/admin/MenuEditPage'));
const OptionGroupEditPage = lazy(() => import('./pages/admin/OptionGroupEditPage'));
const TablesAdminPage = lazy(() => import('./pages/admin/TablesAdminPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const TelegramPage = lazy(() => import('./pages/admin/TelegramPage'));
const PromoPage = lazy(() => import('./pages/admin/PromoPage'));
const HistoryPage = lazy(() => import('./pages/cashier/HistoryPage'));
const PrinterPage = lazy(() => import('./pages/common/PrinterPage'));

function Root() {
  useEffect(() => {
    // Sambung ulang otomatis ke printer yang pernah diizinkan (tanpa dialog).
    void reconnectPrinter();
  }, []);
  return (
    <>
      <UnauthorizedListener />
      <RealtimeBridge />
      <TextSizeSync />
      <NavUsageTracker />
      <ConnectionBanner />
      <Suspense
        fallback={
          <div className="p-6 text-on-surface-variant" role="status">
            …
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </>
  );
}

/** Teks panel detail kosong (tablet). */
function PanePlaceholder({ icon, text }: { icon: Parameters<typeof Icon>[0]['name']; text: string }) {
  return (
    <>
      <span className="flex size-20 items-center justify-center rounded-full bg-surface-container-high">
        <Icon name={icon} size={40} />
      </span>
      <p className="text-body-large">{text}</p>
    </>
  );
}

/** Kasir (tablet): grid menu + panel pesanan yang selalu tampil. HP: grid menu saja (bar keranjang bawah). */
function KasirRoute() {
  const shift = useCurrentShift();
  // Belum ada shift: form buka shift saja (tanpa panel pesanan).
  if (!shift.data) return <CashierPage />;
  return <ListDetail activePath="/kasir" list={<CashierPage />} detail={<OrderDetailPage />} pinned />;
}

/** /kasir/pesanan[/:orderId]: tablet tanpa id = sama dengan /kasir (panel pesanan); selain itu layar penuh. */
function PesananRoute() {
  const { orderId } = useParams();
  const size = useWindowSizeClass();
  return size === 'expanded' && !orderId ? <KasirRoute /> : <OrderDetailPage />;
}

function MejaRoute() {
  const { t } = useTranslation();
  const { tableId } = useParams();
  return (
    <ListDetail
      activePath="/kasir/meja"
      list={<TablesPage />}
      detail={tableId ? <TableBillPage /> : null}
      placeholder={<PanePlaceholder icon="table_restaurant" text={t('bnav.pickTable')} />}
    />
  );
}

function RiwayatRoute() {
  const { t } = useTranslation();
  const { orderId } = useParams();
  return (
    <ListDetail
      activePath="/kasir/riwayat"
      list={<HistoryPage />}
      detail={orderId ? <OrderDetailPage /> : null}
      placeholder={<PanePlaceholder icon="receipt_long" text={t('bnav.pickOrder')} />}
    />
  );
}

function MenuAdminRoute({ option }: { option?: boolean }) {
  const { t } = useTranslation();
  const { itemId } = useParams();
  return (
    <ListDetail
      activePath="/admin/menu"
      list={<MenuListPage />}
      detail={option ? <OptionGroupEditPage /> : itemId ? <MenuEditPage /> : null}
      detailWidth="w-[480px]"
      placeholder={<PanePlaceholder icon="restaurant_menu" text={t('bnav.pickMenu')} />}
    />
  );
}

const guard = (any: PermissionKey[], el: ReactNode) => <RequireAuth any={any}>{el}</RequireAuth>;
const CASHIER: PermissionKey[] = ['order.create', 'order.accept'];
const SHIFT: PermissionKey[] = ['shift.manage'];

/**
 * Peta layar (SPEC + docs/mockups). Agen pos-web mengisi file di src/pages/.
 *   /login                 Login.dc.html
 *   /shift/buka            BukaShift.dc.html
 *   /kasir                 Main.dc.html
 *   /kasir/pesanan/:id?    Pesanan.dc.html     (detail pesanan / keranjang)
 *   /kasir/bayar/:orderId  Bayar.dc.html       (juga ?tableSessionId=)
 *   /kasir/online          OrderWeb.dc.html
 *   /kasir/meja            Meja.dc.html
 *   /kasir/meja/:tableId   MejaDetail.dc.html
 *   /kasir/meja/:tableId/nota  Nota.dc.html
 *   /kasir/pengeluaran     Pengeluaran.dc.html
 *   /kasir/closing         Closing.dc.html
 *   /dapur                 Dapur.dc.html
 *   /driver                Driver.dc.html
 *   /admin                 Dashboard.dc.html
 *   /admin/menu            Menu.dc.html
 *   /admin/menu/:itemId    MenuEdit.dc.html    ('baru' untuk tambah)
 *   /admin/opsi/:groupId   OpsiEdit.dc.html    ('baru' untuk tambah)
 *   /admin/meja            KelolaMeja.dc.html
 *   /admin/pengguna        Users.dc.html
 *   /admin/settings        Settings.dc.html
 *   /admin/telegram        Telegram.dc.html
 *   /admin/promo           Promo & komisi (Settings → link)
 *   /kasir/riwayat/:orderId?  Riwayat order hari ini (+ detail order)
 *   Tablet (≥840px): Kasir/Meja/Riwayat/Kelola menu tampil list-detail berdampingan (ListDetail).
 *   /printer               Printer & suara (per perangkat, semua role)
 */
export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/shift/buka', element: guard(SHIFT, <OpenShiftPage />) },
      { path: '/kasir', element: guard(CASHIER, <KasirRoute />) },
      { path: '/kasir/pesanan/:orderId?', element: guard(CASHIER, <PesananRoute />) },
      { path: '/kasir/bayar/:orderId?', element: guard(['payment.create'], <PaymentPage />) },
      { path: '/kasir/online', element: guard(['order.accept'], <OnlineOrdersPage />) },
      { path: '/kasir/meja/:tableId?', element: guard(CASHIER, <MejaRoute />) },
      { path: '/kasir/meja/:tableId/nota', element: guard(CASHIER, <TempBillPage />) },
      { path: '/kasir/pengeluaran', element: guard(SHIFT, <ExpensesPage />) },
      { path: '/kasir/closing', element: guard(SHIFT, <ClosingPage />) },
      { path: '/kasir/riwayat/:orderId?', element: guard(CASHIER, <RiwayatRoute />) },
      { path: '/printer', element: guard([], <PrinterPage />) },
      { path: '/dapur', element: guard(['kitchen.view'], <KitchenPage />) },
      { path: '/driver', element: guard(['driver.deliver'], <DriverPage />) },
      { path: '/admin', element: guard(['reports.view'], <DashboardPage />) },
      { path: '/admin/menu/:itemId?', element: guard(['menu.manage'], <MenuAdminRoute />) },
      { path: '/admin/opsi/:groupId', element: guard(['menu.manage'], <MenuAdminRoute option />) },
      { path: '/admin/meja', element: guard(['tables.manage'], <TablesAdminPage />) },
      { path: '/admin/pengguna', element: guard(['users.manage'], <UsersPage />) },
      { path: '/admin/settings', element: guard(['settings.manage'], <SettingsPage />) },
      { path: '/admin/telegram', element: guard(['settings.manage'], <TelegramPage />) },
      { path: '/admin/promo', element: guard(['menu.manage'], <PromoPage />) },
      { path: '*', element: <Navigate to="/login" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
