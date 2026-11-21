/**
 * Preferensi per perangkat (localStorage): ukuran teks, bunyi, printer. Bahasa: lib/i18n.ts + lib/useLang.ts.
 * Store kecil dengan useSyncExternalStore supaya semua layar ikut berubah seketika.
 */
import { useSyncExternalStore } from 'react';
import type { TextSize } from '@pos/shared';

export type PaperWidth = 58 | 80;
export type PrinterTransportKind = 'serial' | 'bluetooth' | 'none';

export interface DevicePrefs {
  /** null = ikut default toko (settings.ui.textSize). */
  textSize: TextSize | null;
  muted: boolean;
  paper: PaperWidth;
  printer: PrinterTransportKind;
  /** Nama printer terakhir (untuk ditampilkan). */
  printerName: string | null;
  /** Cetak struk otomatis setelah bayar. */
  autoPrint: boolean;
  /** Bahasa struk (ASCII: id/en). */
  receiptLang: 'id' | 'en';
}

const KEY = 'pos.prefs';
const DEFAULTS: DevicePrefs = {
  textSize: null,
  muted: false,
  paper: 58,
  printer: 'none',
  printerName: null,
  autoPrint: true,
  receiptLang: 'id',
};

function load(): DevicePrefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DevicePrefs>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

let state: DevicePrefs = load();
const listeners = new Set<() => void>();

export function getPrefs(): DevicePrefs {
  return state;
}

export function setPrefs(patch: Partial<DevicePrefs>): void {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* penyimpanan penuh / mode privat */
  }
  if (patch.textSize) applyTextSize(patch.textSize);
  listeners.forEach((l) => l());
}

/** Untuk test: kembalikan ke default. */
export function resetPrefs(): void {
  state = { ...DEFAULTS };
  listeners.forEach((l) => l());
}

export function usePrefs(): DevicePrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

/** Terapkan ukuran teks ke seluruh aplikasi (html[data-text-size] → zoom di index.css). */
export function applyTextSize(size: TextSize): void {
  if (typeof document === 'undefined') return;
  if (size === 'normal') delete document.documentElement.dataset.textSize;
  else document.documentElement.dataset.textSize = size;
}

applyTextSize(state.textSize ?? 'normal');
