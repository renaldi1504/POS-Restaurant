/**
 * Manajer printer singleton: hubungkan, sambung ulang otomatis, cetak. Status bisa dipantau via hook.
 */
import { useSyncExternalStore } from 'react';
import { getPrefs, setPrefs } from '../prefs';
import {
  reconnectBluetooth,
  reconnectSerial,
  requestBluetooth,
  requestSerial,
  type PrinterTransport,
} from './transports';

export interface PrinterStatus {
  connected: boolean;
  name: string | null;
  busy: boolean;
  error: string | null;
}

let transport: PrinterTransport | null = null;
let status: PrinterStatus = { connected: false, name: getPrefs().printerName, busy: false, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<PrinterStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function usePrinterStatus(): PrinterStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => status,
  );
}

export function isPrinterConnected(): boolean {
  return !!transport?.isOpen();
}

/** Hubungkan printer baru (dialog browser — panggil dari klik). */
export async function connectPrinter(kind: 'serial' | 'bluetooth'): Promise<void> {
  set({ busy: true, error: null });
  try {
    await transport?.close();
    transport = kind === 'serial' ? await requestSerial() : await requestBluetooth();
    setPrefs({ printer: kind, printerName: transport.name });
    set({ connected: true, name: transport.name });
  } catch (e) {
    set({ error: (e as Error).message, connected: false });
    throw e;
  } finally {
    set({ busy: false });
  }
}

/** Sambung ulang ke printer yang pernah diizinkan (tanpa dialog). */
export async function reconnectPrinter(): Promise<boolean> {
  const kind = getPrefs().printer;
  if (kind === 'none') return false;
  if (transport?.isOpen()) return true;
  try {
    transport = kind === 'serial' ? await reconnectSerial() : await reconnectBluetooth();
    set({ connected: !!transport, name: transport?.name ?? getPrefs().printerName, error: null });
    return !!transport;
  } catch (e) {
    set({ connected: false, error: (e as Error).message });
    return false;
  }
}

export async function disconnectPrinter(): Promise<void> {
  await transport?.close();
  transport = null;
  setPrefs({ printer: 'none', printerName: null });
  set({ connected: false, name: null });
}

/** Kirim byte ESC/POS. Melempar error bila printer belum terhubung. */
export async function printBytes(data: Uint8Array): Promise<void> {
  if (!transport?.isOpen()) {
    const ok = await reconnectPrinter();
    if (!ok || !transport) throw new Error('localErr.notConnected');
  }
  set({ busy: true, error: null });
  try {
    try {
      await transport.write(data);
    } catch {
      // Koneksi basi (mis. iPad baru bangun dari layar mati) → sambung ulang sekali lalu ulangi.
      await transport.close().catch(() => undefined);
      transport = null;
      const ok = await reconnectPrinter();
      if (!ok || !transport) throw new Error('localErr.notConnected');
      await (transport as PrinterTransport).write(data);
    }
  } catch (e) {
    set({ error: (e as Error).message, connected: !!transport?.isOpen() });
    throw e;
  } finally {
    set({ busy: false });
  }
}
