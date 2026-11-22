/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** ID build aplikasi (lihat packages/shared/vite/appVersion.ts). */
declare const __APP_BUILD__: string;
