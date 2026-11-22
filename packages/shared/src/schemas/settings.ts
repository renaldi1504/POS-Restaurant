import { z } from 'zod';
import { Currency, TextSize } from '../enums';
import { HHMM, Lat, Lng, NonNegMoney, Ymd } from './common';

export const ProfileSettings = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(300),
  /** Patokan / petunjuk arah (mis. "seberang Golden Lion, lantai 1"). */
  landmark: z.string().max(300),
  /** Link Google Maps lokasi restoran (opsional; bila kosong dibuat dari lat/lng). */
  mapsUrl: z.string().max(500),
  phone: z.string().max(50),
  logoUrl: z.string().nullable(),
  /** Koordinat restoran — untuk jarak driver (haversine). */
  lat: Lat.nullable(),
  lng: Lng.nullable(),
});

export const DayHours = z.object({ open: HHMM, close: HHMM, closed: z.boolean() });
export type DayHours = z.infer<typeof DayHours>;

export const OpenPeriodSchema = z.object({ open: HHMM, close: HHMM });

export const HoursSettings = z.object({
  /** Jam buka pertama & tutup terakhir (rentang hari operasional; diisi otomatis dari `periods`). */
  open: HHMM,
  close: HHMM,
  /** Sesi buka (mis. 08:00–14:00 & 17:00–20:00). Kosong = satu sesi open–close. */
  periods: z.array(OpenPeriodSchema).max(4),
  sameEveryDay: z.boolean(),
  /** Jika sameEveryDay=false: 7 entri, index 0 = Minggu. */
  perDay: z.array(DayHours).length(7).optional(),
  /** Tanggal libur (business_date) YYYY-MM-DD. */
  holidays: z.array(Ymd),
});
export type HoursSettings = z.infer<typeof HoursSettings>;

export const CurrencySettings = z.object({
  main: Currency,
  enabled: z.array(Currency).min(1),
  /** Berapa KHR per 1 unit utama (USD: 4100, IDR: 0.25). */
  rates: z.object({ USD: z.number().positive(), IDR: z.number().positive() }),
});
export type CurrencySettings = z.infer<typeof CurrencySettings>;

export const DeliverySettings = z.object({
  /** Minimal order delivery (mata uang utama, minor). 0 = tanpa minimum. */
  minOrder: NonNegMoney,
  defaultFee: NonNegMoney,
});

export const KitchenSettings = z.object({ lateMinutes: z.number().int().min(1).max(240) });
export const AiSettings = z.object({
  enabled: z.boolean(),
  /** Info tambahan untuk bot (parkir, tempat duduk, wifi, cara ke lokasi, dll). */
  notes: z.string().max(2000),
});
export const QrSettings = z.object({ requireAccept: z.boolean() });
export const CommissionSettings = z.object({
  grab: z.number().min(0).max(100),
  foodpanda: z.number().min(0).max(100),
});
export const UiSettings = z.object({ textSize: TextSize });
export const ShiftSettings = z.object({
  /** Tandai semua menu tersedia otomatis saat buka shift. */
  autoAvailableOnOpen: z.boolean(),
  /** Nama shift yang ditawarkan saat buka shift. */
  names: z.array(z.string().min(1).max(30)),
});
/** Rekening ABA untuk transfer pelanggan (ditampilkan di web pelanggan). */
export const AbaAccount = z.object({
  accountName: z.string().max(100),
  accountNumber: z.string().max(50),
  /** Gambar QR KHQR/ABA (opsional). */
  qrImageUrl: z.string().max(500).nullable().optional(),
});
export type AbaAccount = z.infer<typeof AbaAccount>;
export const PaymentSettings = z.object({ aba: AbaAccount });

/**
 * Bentuk lengkap settings (tabel `settings`, satu baris per key).
 * Sengaja TANPA `.default()` supaya `SettingsPatch` (partial) tidak mengisi nilai default diam-diam;
 * server menggabungkan nilai DB dengan `DEFAULT_SETTINGS`.
 */
export const Settings = z.object({
  profile: ProfileSettings,
  hours: HoursSettings,
  currency: CurrencySettings,
  delivery: DeliverySettings,
  kitchen: KitchenSettings,
  ai: AiSettings,
  qr: QrSettings,
  commissions: CommissionSettings,
  ui: UiSettings,
  shift: ShiftSettings,
  payment: PaymentSettings,
});
export type Settings = z.infer<typeof Settings>;
export type SettingsKey = keyof Settings;
export const SETTINGS_KEYS = Object.keys(Settings.shape) as SettingsKey[];

export const DEFAULT_SETTINGS: Settings = {
  profile: {
    name: 'Rumah Makan Berkat',
    address: 'Sihanoukville, Kamboja',
    landmark: '',
    mapsUrl: '',
    phone: '',
    logoUrl: null,
    lat: 10.6278,
    lng: 103.5221,
  },
  hours: { open: '08:00', close: '03:00', periods: [], sameEveryDay: true, holidays: [] },
  currency: { main: 'KHR', enabled: ['KHR', 'USD', 'IDR'], rates: { USD: 4100, IDR: 0.25 } },
  delivery: { minOrder: 0, defaultFee: 0 },
  kitchen: { lateMinutes: 15 },
  ai: { enabled: true, notes: '' },
  qr: { requireAccept: true },
  commissions: { grab: 30, foodpanda: 30 },
  ui: { textSize: 'normal' },
  shift: { autoAvailableOnOpen: false, names: ['Pagi', 'Malam'] },
  payment: { aba: { accountName: '', accountNumber: '', qrImageUrl: null } },
};

/** `PATCH /admin/settings` — setiap bagian opsional & parsial. */
export const SettingsPatch = z.object({
  profile: ProfileSettings.partial().optional(),
  hours: HoursSettings.partial().optional(),
  currency: CurrencySettings.partial().optional(),
  delivery: DeliverySettings.partial().optional(),
  kitchen: KitchenSettings.partial().optional(),
  ai: AiSettings.partial().optional(),
  qr: QrSettings.partial().optional(),
  commissions: CommissionSettings.partial().optional(),
  ui: UiSettings.partial().optional(),
  shift: ShiftSettings.partial().optional(),
  payment: z.object({ aba: AbaAccount.partial() }).partial().optional(),
});
export type SettingsPatch = z.infer<typeof SettingsPatch>;

/** Status integrasi luar (key ada / mode mock). */
export const IntegrationStatus = z.object({
  telegram: z.boolean(),
  telegramBotUsername: z.string().nullable(),
  gemini: z.boolean(),
  maps: z.boolean(),
  r2: z.boolean(),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatus>;

export const AdminSettingsResponse = z.object({ settings: Settings, integrations: IntegrationStatus });
export type AdminSettingsResponse = z.infer<typeof AdminSettingsResponse>;

/** `GET /public/settings`. */
export const PublicSettingsResponse = z.object({
  name: z.string(),
  logoUrl: z.string().nullable(),
  address: z.string(),
  phone: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  hours: z.object({
    open: HHMM,
    close: HHMM,
    /** Semua sesi buka (minimal 1). */
    periods: z.array(OpenPeriodSchema).min(1),
    /** Jam buka berikutnya bila sedang tutup (mis. istirahat siang), null bila buka. */
    nextOpen: HHMM.nullable(),
  }),
  isOpen: z.boolean(),
  businessDate: Ymd,
  currency: CurrencySettings,
  delivery: z.object({ minOrder: NonNegMoney, defaultFee: NonNegMoney }),
  qrRequireAccept: z.boolean(),
  telegramBotUsername: z.string().nullable(),
  /** Rekening ABA (null bila belum diisi admin). */
  aba: AbaAccount.nullable(),
});
export type PublicSettingsResponse = z.infer<typeof PublicSettingsResponse>;

/**
 * `GET /settings/staff` — settings yang dibutuhkan semua staf (bukan hanya admin):
 * ukuran teks default, batas terlambat dapur, nama shift, komisi, delivery, QR.
 */
export const StaffSettingsResponse = z.object({
  settings: z.object({
    ui: UiSettings,
    kitchen: KitchenSettings,
    shift: ShiftSettings,
    commissions: CommissionSettings,
    delivery: DeliverySettings,
    qr: QrSettings,
  }),
});
export type StaffSettingsResponse = z.infer<typeof StaffSettingsResponse>;
