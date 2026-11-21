import { z } from 'zod';
import { Currency, TextSize } from '../enums';
import { HHMM, Lat, Lng, NonNegMoney, Ymd } from './common';

export const ProfileSettings = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(300),
  phone: z.string().max(50),
  logoUrl: z.string().nullable(),
  /** Koordinat restoran — untuk jarak driver (haversine). */
  lat: Lat.nullable(),
  lng: Lng.nullable(),
});

export const DayHours = z.object({ open: HHMM, close: HHMM, closed: z.boolean() });
export type DayHours = z.infer<typeof DayHours>;

export const HoursSettings = z.object({
  open: HHMM,
  close: HHMM,
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
export const AiSettings = z.object({ enabled: z.boolean() });
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
});
export type Settings = z.infer<typeof Settings>;
export type SettingsKey = keyof Settings;
export const SETTINGS_KEYS = Object.keys(Settings.shape) as SettingsKey[];

export const DEFAULT_SETTINGS: Settings = {
  profile: {
    name: 'Rumah Makan Berkat',
    address: 'Sihanoukville, Kamboja',
    phone: '',
    logoUrl: null,
    lat: 10.6278,
    lng: 103.5221,
  },
  hours: { open: '08:00', close: '03:00', sameEveryDay: true, holidays: [] },
  currency: { main: 'KHR', enabled: ['KHR', 'USD', 'IDR'], rates: { USD: 4100, IDR: 0.25 } },
  delivery: { minOrder: 0, defaultFee: 0 },
  kitchen: { lateMinutes: 15 },
  ai: { enabled: true },
  qr: { requireAccept: true },
  commissions: { grab: 30, foodpanda: 30 },
  ui: { textSize: 'normal' },
  shift: { autoAvailableOnOpen: false, names: ['Pagi', 'Malam'] },
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
  hours: z.object({ open: HHMM, close: HHMM }),
  isOpen: z.boolean(),
  businessDate: Ymd,
  currency: CurrencySettings,
  delivery: z.object({ minOrder: NonNegMoney, defaultFee: NonNegMoney }),
  qrRequireAccept: z.boolean(),
  telegramBotUsername: z.string().nullable(),
});
export type PublicSettingsResponse = z.infer<typeof PublicSettingsResponse>;
