/**
 * Printer BLE lewat aplikasi iPad/iOS (Capacitor + @capacitor-community/bluetooth-le).
 * Safari tidak punya Web Bluetooth, jadi di dalam aplikasi native transport ini dipakai sebagai
 * pengganti — antarmuka sama dengan Web Bluetooth, dan printer tersambung ulang otomatis.
 */
import type { PrinterTransport } from './transports';

const DEVICE_KEY = 'pos.nativeBlePrinter';

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

/** Berjalan di dalam aplikasi native (Capacitor)? */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

const plugin = () => import('@capacitor-community/bluetooth-le');

class NativeBleTransport implements PrinterTransport {
  readonly kind = 'bluetooth' as const;
  private open = true;
  constructor(
    private deviceId: string,
    private service: string,
    private characteristic: string,
    private withoutResponse: boolean,
    private chunkSize: number,
    readonly name: string,
  ) {}
  markClosed() {
    this.open = false;
  }
  async write(data: Uint8Array): Promise<void> {
    const { BleClient } = await plugin();
    for (let i = 0; i < data.length; i += this.chunkSize) {
      const chunk = data.slice(i, i + this.chunkSize);
      const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      if (this.withoutResponse) {
        await BleClient.writeWithoutResponse(this.deviceId, this.service, this.characteristic, view);
        // jeda kecil agar buffer printer tidak meluap
        await new Promise((r) => setTimeout(r, 25));
      } else {
        await BleClient.write(this.deviceId, this.service, this.characteristic, view);
      }
    }
  }
  async close(): Promise<void> {
    const { BleClient } = await plugin();
    this.open = false;
    await BleClient.disconnect(this.deviceId).catch(() => undefined);
  }
  isOpen(): boolean {
    return this.open;
  }
}

async function connectNative(
  deviceId: string,
  name: string,
  preferred: readonly string[],
): Promise<PrinterTransport> {
  const { BleClient } = await plugin();
  let transport: NativeBleTransport | null = null;
  await BleClient.connect(deviceId, () => transport?.markClosed(), { timeout: 10_000 });
  const services = await BleClient.getServices(deviceId);
  // Service printer yang dikenal dulu, lalu service lain yang punya karakteristik tulis.
  const ordered = [
    ...services.filter((s) => preferred.includes(s.uuid.toLowerCase())),
    ...services.filter((s) => !preferred.includes(s.uuid.toLowerCase())),
  ];
  for (const s of ordered) {
    const ch = s.characteristics.find((c) => c.properties.writeWithoutResponse || c.properties.write);
    if (!ch) continue;
    const mtu = await BleClient.getMtu(deviceId).catch(() => 23);
    const chunk = Math.max(20, Math.min(180, mtu - 3));
    transport = new NativeBleTransport(
      deviceId,
      s.uuid,
      ch.uuid,
      ch.properties.writeWithoutResponse,
      chunk,
      name,
    );
    return transport;
  }
  await BleClient.disconnect(deviceId).catch(() => undefined);
  throw new Error('localErr.serviceNotFound');
}

/** Pilih printer (daftar perangkat BLE di sekitar) lalu simpan untuk sambung ulang otomatis. */
export async function requestNativeBle(services: readonly string[]): Promise<PrinterTransport> {
  const { BleClient } = await plugin();
  await BleClient.initialize({ androidNeverForLocation: true });
  const device = await BleClient.requestDevice({ optionalServices: [...services] });
  const name = device.name ?? 'Printer Bluetooth';
  const t = await connectNative(device.deviceId, name, services);
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ id: device.deviceId, name }));
  } catch {
    /* storage penuh/terkunci: tetap jalan, hanya tidak tersambung otomatis */
  }
  return t;
}

/** Sambung ulang ke printer terakhir tanpa dialog (saat aplikasi dibuka / sebelum cetak). */
export async function reconnectNativeBle(services: readonly string[]): Promise<PrinterTransport | null> {
  let saved: { id: string; name: string } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? 'null') as { id: string; name: string } | null;
  } catch {
    saved = null;
  }
  if (!saved?.id) return null;
  const { BleClient } = await plugin();
  await BleClient.initialize({ androidNeverForLocation: true });
  return connectNative(saved.id, saved.name, services);
}
