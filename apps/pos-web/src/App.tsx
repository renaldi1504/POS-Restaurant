import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import type { PermissionKey } from '@pos/shared';
import { RequireAuth, UnauthorizedListener } from './lib/auth';
import { RealtimeBridge } from './lib/data';
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
      <Suspense
        fallback={
          <div className="p-6 text-muted" role="status">
            …
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </>
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
 *   /kasir/riwayat         Riwayat order hari ini
 *   /printer               Printer & suara (per perangkat, semua role)
 */
export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/shift/buka', element: guard(SHIFT, <OpenShiftPage />) },
      { path: '/kasir', element: guard(CASHIER, <CashierPage />) },
      { path: '/kasir/pesanan/:orderId?', element: guard(CASHIER, <OrderDetailPage />) },
      { path: '/kasir/bayar/:orderId?', element: guard(['payment.create'], <PaymentPage />) },
      { path: '/kasir/online', element: guard(['order.accept'], <OnlineOrdersPage />) },
      { path: '/kasir/meja', element: guard(CASHIER, <TablesPage />) },
      { path: '/kasir/meja/:tableId', element: guard(CASHIER, <TableBillPage />) },
      { path: '/kasir/meja/:tableId/nota', element: guard(CASHIER, <TempBillPage />) },
      { path: '/kasir/pengeluaran', element: guard(SHIFT, <ExpensesPage />) },
      { path: '/kasir/closing', element: guard(SHIFT, <ClosingPage />) },
      { path: '/kasir/riwayat', element: guard(CASHIER, <HistoryPage />) },
      { path: '/printer', element: guard([], <PrinterPage />) },
      { path: '/dapur', element: guard(['kitchen.view'], <KitchenPage />) },
      { path: '/driver', element: guard(['driver.deliver'], <DriverPage />) },
      { path: '/admin', element: guard(['reports.view'], <DashboardPage />) },
      { path: '/admin/menu', element: guard(['menu.manage'], <MenuListPage />) },
      { path: '/admin/menu/:itemId', element: guard(['menu.manage'], <MenuEditPage />) },
      { path: '/admin/opsi/:groupId', element: guard(['menu.manage'], <OptionGroupEditPage />) },
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
