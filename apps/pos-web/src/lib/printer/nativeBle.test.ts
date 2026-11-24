import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writes: number[][] = [];
const ble = {
  initialize: vi.fn(async () => undefined),
  requestDevice: vi.fn(async () => ({ deviceId: 'DEV-1', name: 'MPT-II' })),
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
  getMtu: vi.fn(async () => 23),
  getServices: vi.fn(async () => [
    { uuid: '0000180a-0000-1000-8000-00805f9b34fb', characteristics: [] },
    {
      uuid: '000018f0-0000-1000-8000-00805f9b34fb',
      characteristics: [
        { uuid: 'notify', properties: { notify: true, write: false, writeWithoutResponse: false } },
        {
          uuid: '00002af1-0000-1000-8000-00805f9b34fb',
          properties: { write: true, writeWithoutResponse: true },
        },
      ],
    },
  ]),
  writeWithoutResponse: vi.fn(async (_d: string, _s: string, _c: string, v: DataView) => {
    writes.push(Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)));
  }),
  write: vi.fn(async () => undefined),
};
vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: ble }));

import { isNativeApp, reconnectNativeBle, requestNativeBle } from './nativeBle';
import { BLE_SERVICES, requestBluetooth, supportsBluetooth } from './transports';

describe('printer BLE di aplikasi iPad (Capacitor)', () => {
  beforeEach(() => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
    localStorage.clear();
    writes.length = 0;
  });
  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  });

  it('terdeteksi native → Bluetooth didukung walau tanpa Web Bluetooth', () => {
    expect(isNativeApp()).toBe(true);
    expect(supportsBluetooth()).toBe(true);
  });

  it('pilih printer → karakteristik tulis di service printer, data dipecah sesuai MTU', async () => {
    const t = await requestBluetooth();
    expect(t.name).toBe('MPT-II');
    await t.write(new Uint8Array(45).map((_, i) => i));
    expect(writes.map((w) => w.length)).toEqual([20, 20, 5]);
    expect(ble.writeWithoutResponse.mock.calls[0]!.slice(1, 3)).toEqual([
      '000018f0-0000-1000-8000-00805f9b34fb',
      '00002af1-0000-1000-8000-00805f9b34fb',
    ]);
  });

  it('sambung ulang otomatis ke printer terakhir tanpa dialog', async () => {
    expect(await reconnectNativeBle(BLE_SERVICES)).toBeNull();
    await requestNativeBle(BLE_SERVICES);
    ble.requestDevice.mockClear();
    const t = await reconnectNativeBle(BLE_SERVICES);
    expect(t?.name).toBe('MPT-II');
    expect(ble.requestDevice).not.toHaveBeenCalled();
    expect(ble.connect).toHaveBeenLastCalledWith('DEV-1', expect.any(Function), { timeout: 10_000 });
  });
});
