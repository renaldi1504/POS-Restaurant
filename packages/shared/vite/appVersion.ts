/**
 * Plugin Vite: ID build unik (`__APP_BUILD__`) + file `version.json` di hasil build.
 * Klien membandingkan keduanya untuk tahu ada versi baru setelah server di-update.
 */
/** Bentuk minimal plugin Vite/Rollup (tanpa mengimpor tipe vite dari paket ini). */
interface VersionPlugin {
  name: string;
  config: () => { define: Record<string, string> };
  generateBundle: (this: {
    emitFile: (f: { type: 'asset'; fileName: string; source: string }) => string;
  }) => void;
}

export const APP_BUILD = process.env.APP_BUILD || `${Date.now().toString(36)}`;

export function appVersion(): VersionPlugin {
  return {
    name: 'pos-app-version',
    config: () => ({ define: { __APP_BUILD__: JSON.stringify(APP_BUILD) } }),
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: APP_BUILD, at: new Date().toISOString() }),
      });
    },
  };
}
