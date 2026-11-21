import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import MenuPage from './pages/MenuPage';

const CartPage = lazy(() => import('./pages/CartPage'));
const AddressPage = lazy(() => import('./pages/AddressPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const OrderStatusPage = lazy(() => import('./pages/OrderStatusPage'));
const TableBillPage = lazy(() => import('./pages/TableBillPage'));

function Root() {
  return (
    <Suspense fallback={<div className="p-6 text-muted">…</div>}>
      <Outlet />
    </Suspense>
  );
}

/**
 * Peta layar order-web:
 *   /                 menu (mode biasa)            Website.dc.html
 *   /tg               menu (Telegram Mini App)     Website.dc.html + Telegram.dc.html
 *   /m/:qrToken       menu (scan QR meja)          WebsiteMeja.dc.html
 *   /keranjang        keranjang
 *   /alamat           pilih alamat                 Alamat.dc.html
 *   /checkout         pembayaran (ABA / cash)
 *   /pesanan/:id      status order
 *   /meja/tagihan     tagihan berjalan meja
 */
export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <MenuPage mode="none" /> },
      { path: '/tg', element: <MenuPage mode="telegram" /> },
      { path: '/m/:qrToken', element: <MenuPage mode="table" /> },
      { path: '/keranjang', element: <CartPage /> },
      { path: '/alamat', element: <AddressPage /> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/pesanan/:id', element: <OrderStatusPage /> },
      { path: '/meja/tagihan', element: <TableBillPage /> },
      { path: '*', element: <MenuPage mode="none" /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
