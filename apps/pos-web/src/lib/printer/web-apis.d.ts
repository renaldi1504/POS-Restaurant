/* Tipe minimal Web Serial & Web Bluetooth (belum ada di lib DOM TypeScript). */
interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
  bluetoothServiceClassId?: number | string;
}
interface SerialPort extends EventTarget {
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}
interface Serial extends EventTarget {
  requestPort(options?: {
    filters?: { usbVendorId?: number; bluetoothServiceClassId?: number | string }[];
    allowedBluetoothServiceClassIds?: (number | string)[];
  }): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface BluetoothCharacteristicProperties {
  readonly write: boolean;
  readonly writeWithoutResponse: boolean;
}
interface BluetoothRemoteGATTCharacteristic {
  readonly uuid: string;
  readonly properties: BluetoothCharacteristicProperties;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
}
interface BluetoothRemoteGATTService {
  readonly uuid: string;
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
}
interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}
interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
}
interface Bluetooth {
  requestDevice(options: {
    filters?: { services?: string[]; namePrefix?: string }[];
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
}
interface Navigator {
  readonly serial?: Serial;
  readonly bluetooth?: Bluetooth;
}
