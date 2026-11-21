/** Pesanan (keranjang) & detail order — acuan: docs/mockups/Pesanan.dc.html. */
import { useParams } from 'react-router';
import { CartView } from './CartView';
import { ExistingOrderView } from './ExistingOrderView';

export default function OrderDetailPage() {
  const { orderId } = useParams();
  return orderId ? <ExistingOrderView orderId={orderId} /> : <CartView />;
}
