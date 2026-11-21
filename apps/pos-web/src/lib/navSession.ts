/**
 * State sesi navigation bar: slot dihitung sekali per login / start aplikasi lalu disimpan di memori,
 * supaya urutan tidak bergeser saat staf bekerja (SKILL §8.5). Pin mengubah slot langsung (aksi sadar user).
 */
import { useSyncExternalStore } from 'react';
import type { StaffUser } from '@pos/shared';
import { computeSlots, loadUsage } from './navUsage';

const sessionSlots = new Map<number, string[]>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

/** Login / logout: slot dihitung ulang dari catatan pemakaian terbaru. */
export function resetNavSession(): void {
  sessionSlots.clear();
  notify();
}

export function sessionSlotsFor(user: Pick<StaffUser, 'id' | 'permissions'>): string[] {
  let s = sessionSlots.get(user.id);
  if (!s) {
    s = computeSlots(loadUsage(user.id), user.permissions);
    sessionSlots.set(user.id, s);
  }
  return s;
}

export function setSessionSlots(userId: number, slots: string[]): void {
  sessionSlots.set(userId, slots);
  notify();
}

export function useNavSessionVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => version,
  );
}
