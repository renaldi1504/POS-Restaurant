/**
 * Transport printer: Web Serial (Bluetooth SPP / USB) dan Web Bluetooth (BLE).
 */

/** Bluetooth Serial Port Profile (RFCOMM) — printer thermal klasik yang dipasangkan di OS. */
export const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';
/** Service BLE yang umum di printer thermal murah. */
export const BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
] as const;

export interface PrinterTransport {
  readonly kind: 'serial' | 'bluetooth';
  readonly name: string;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  isOpen(): boolean;
}

export const supportsSerial = () => typeof navigator !== 'undefined' && !!navigator.serial;
export const supportsBluetooth = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

// ---------------- Web Serial ----------------
class SerialTransport implements PrinterTransport {
  readonly kind = 'serial' as const;
  private open = true;
  constructor(
    private port: SerialPort,
    readonly name: string,
  ) {}
  async write(data: Uint8Array): Promise<void> {
    const w = this.port.writable?.getWriter();
    if (!w) throw new Error('localErr.portWrite');
    try {
      await w.write(data);
    } finally {
      w.releaseLock();
    }
  }
  async close(): Promise<void> {
    this.open = false;
    await this.port.close().catch(() => undefined);
  }
  isOpen(): boolean {
    return this.open && !!this.port.writable;
  }
}

function serialName(p: SerialPort): string {
  const info = p.getInfo();
  if (info.bluetoothServiceClassId) return 'Printer Bluetooth (serial)';
  if (info.usbVendorId) return `Printer USB ${info.usbVendorId.toString(16)}`;
  return 'Printer serial';
}

async function openSerial(port: SerialPort): Promise<SerialTransport> {
  try {
    await port.open({ baudRate: 9600 });
  } catch (e) {
    // Sudah terbuka (InvalidStateError) → pakai saja.
    if ((e as Error)?.name !== 'InvalidStateError') throw e;
  }
  return new SerialTransport(port, serialName(port));
}

/** Pilih port (dialog browser). Wajib dari klik pengguna. */
export async function requestSerial(): Promise<PrinterTransport> {
  if (!navigator.serial) throw new Error('localErr.noSerial');
  const port = await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] });
  return openSerial(port);
}

/** Sambung ulang otomatis ke port yang pernah diizinkan (tanpa dialog). */
export async function reconnectSerial(): Promise<PrinterTransport | null> {
  if (!navigator.serial) return null;
  const ports = await navigator.serial.getPorts();
  const port = ports[0];
  return port ? openSerial(port) : null;
}

// ---------------- Web Bluetooth (BLE) ----------------
class BleTransport implements PrinterTransport {
  readonly kind = 'bluetooth' as const;
  constructor(
    private device: BluetoothDevice,
    private ch: BluetoothRemoteGATTCharacteristic,
    readonly name: string,
    private chunkSize = 100,
  ) {}
  async write(data: Uint8Array): Promise<void> {
    for (let i = 0; i < data.length; i += this.chunkSize) {
      const chunk = data.slice(i, i + this.chunkSize);
      if (this.ch.properties.writeWithoutResponse && this.ch.writeValueWithoutResponse) {
        await this.ch.writeValueWithoutResponse(chunk);
        // jeda kecil agar buffer printer tidak meluap
        await new Promise((r) => setTimeout(r, 20));
      } else {
        await this.ch.writeValue(chunk);
      }
    }
  }
  async close(): Promise<void> {
    this.device.gatt?.disconnect();
  }
  isOpen(): boolean {
    return !!this.device.gatt?.connected;
  }
}

async function connectBle(device: BluetoothDevice): Promise<PrinterTransport> {
  const server = await device.gatt?.connect();
  if (!server) throw new Error('localErr.noGatt');
  for (const uuid of BLE_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid);
      const chars = await service.getCharacteristics();
      const ch = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
      if (ch) return new BleTransport(device, ch, device.name ?? 'Printer Bluetooth');
    } catch {
      /* service tidak ada, coba berikutnya */
    }
  }
  server.disconnect();
  throw new Error('localErr.serviceNotFound');
}

export async function requestBluetooth(): Promise<PrinterTransport> {
  if (!navigator.bluetooth) throw new Error('localErr.noBluetooth');
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [...BLE_SERVICES],
  });
  return connectBle(device);
}

export async function reconnectBluetooth(): Promise<PrinterTransport | null> {
  const devices = (await navigator.bluetooth?.getDevices?.()) ?? [];
  const d = devices[0];
  return d ? connectBle(d) : null;
}
