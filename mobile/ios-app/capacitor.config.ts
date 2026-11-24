import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Alamat POS staf (sama dengan POS_ORIGIN di server), mis. https://pos.contoh.com
 * Set saat sync:  POS_URL=https://pos.contoh.com npx cap sync ios
 * Aplikasi memuat POS langsung dari server → update fitur lewat update.sh langsung masuk tanpa build ulang.
 */
const POS_URL = process.env.POS_URL ?? 'https://pos.example.com';

const config: CapacitorConfig = {
  appId: 'com.rumahmakanberkat.pos',
  appName: 'POS Berkat',
  webDir: 'www',
  server: {
    url: POS_URL,
    cleartext: false,
    errorPath: 'index.html',
  },
  ios: {
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Mencari printer…',
        cancel: 'Batal',
        availableDevices: 'Printer di sekitar',
        noDeviceFound: 'Printer tidak ditemukan',
      },
    },
  },
};

export default config;
