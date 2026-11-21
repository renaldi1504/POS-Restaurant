import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qk } from './api';
import { useCustomer } from './customer';
import { useSocketStatus } from './socket';

/** Tagihan berjalan meja (mode meja). Realtime via `table.updated`/`order.*`, polling sebagai cadangan. */
export function useTableBill() {
  const { mode, status } = useCustomer();
  const { connected } = useSocketStatus();
  return useQuery({
    queryKey: qk.tableBill,
    queryFn: () => api.call('publicTableBill'),
    enabled: mode === 'table' && status === 'ready',
    refetchInterval: connected ? 60_000 : 15_000,
  });
}

export function useRequestBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.call('publicTableBillRequest'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tableBill });
    },
  });
}
