/** Printer & suara (per perangkat): hubungkan printer thermal, kertas, bahasa struk, tes cetak, bunyi. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button, Segmented, useToast } from '../../components/ui';
import { ReceiptPreview, Screen, Section, Switch, TopBar } from '../../components/common';
import { useMe, homePathFor } from '../../lib/auth';
import { deviceErrorText } from '../../lib/api';
import { usePublicSettings, useMoney } from '../../lib/data';
import { setPrefs, usePrefs } from '../../lib/prefs';
import {
  connectPrinter,
  disconnectPrinter,
  supportsBluetooth,
  supportsSerial,
  usePrinterStatus,
  type ReceiptData,
} from '../../lib/printer';
import { printReceipt } from '../../lib/print';
import { beep } from '../../lib/sound';

export function testReceipt(
  shop: string,
  money: ReturnType<typeof useMoney>,
  lang: 'id' | 'en',
): ReceiptData {
  return {
    kind: 'receipt',
    lang,
    shop: { name: shop, address: 'Tes cetak / Test print' },
    date: new Date(),
    cashier: 'Tes',
    orderNo: '#0',
    groups: [
      {
        items: [
          { qty: 2, name: 'Ayam Goreng', options: ['Paha atas', 'Tidak pedas'], total: 20000 },
          { qty: 1, name: 'Es Teh Manis', options: [], total: 4000 },
        ],
      },
    ],
    subtotal: 24000,
    discount: 0,
    deliveryFee: 0,
    total: 24000,
    currency: money.main,
    rates: money.rates,
    equivalents: money.others,
    payments: [{ label: 'Cash KHR', amount: 50000, currency: 'KHR' }],
    change: 26000,
  };
}

/** iPad / iPhone (iPadOS modern melapor sebagai Mac dengan layar sentuh). */
function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export default function PrinterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: me } = useMe();
  const prefs = usePrefs();
  const status = usePrinterStatus();
  const settings = usePublicSettings();
  const money = useMoney();
  const [testing, setTesting] = useState(false);
  const sample = testReceipt(settings.data?.name ?? 'Rumah Makan Berkat', money, prefs.receiptLang);
  const connect = async (kind: 'serial' | 'bluetooth') => {
    try {
      await connectPrinter(kind);
      toast.success(t('printer.connected'));
    } catch (e) {
      if ((e as Error).name !== 'NotFoundError') toast.error(deviceErrorText((e as Error).message, t));
    }
  };
  return (
    <Screen testId="printer-screen">
      <TopBar
        back={{
          label: t('common.back'),
          onClick: () =>
            window.history.length > 1 ? navigate(-1) : navigate(me ? homePathFor(me.permissions) : '/login'),
        }}
        title={t('admin.printerSound')}
      />
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto p-3">
        <Section title={t('printer.title')}>
          <div
            role="status"
            className={
              status.connected
                ? 'rounded-md bg-secondary-container px-3 py-2.5 font-medium text-on-secondary-container'
                : 'rounded-md bg-warning-container px-3 py-2.5 font-medium text-on-warning-container'
            }
          >
            {status.connected
              ? `${t('printer.connected')} · ${status.name ?? ''}`
              : prefs.printer !== 'none'
                ? t('print.saved', { name: prefs.printerName ?? '' })
                : t('printer.disconnected')}
            {status.error ? (
              <div className="text-label-medium font-medium text-error">
                {deviceErrorText(status.error, t)}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outlined"
              disabled={!supportsSerial() || status.busy}
              onClick={() => void connect('serial')}
            >
              {t('print.serial')}
            </Button>
            <Button
              variant="outlined"
              disabled={!supportsBluetooth() || status.busy}
              onClick={() => void connect('bluetooth')}
            >
              {t('print.ble')}
            </Button>
          </div>
          {!supportsSerial() && !supportsBluetooth() ? (
            <span className="text-label-medium text-error">
              {isAppleMobile() ? t('print.unsupportedIos') : t('print.unsupported')}
            </span>
          ) : (
            <span className="text-label-medium text-on-surface-variant">{t('print.howTo')}</span>
          )}
          {prefs.printer !== 'none' ? (
            <Button variant="text" size="md" className="text-error" onClick={() => void disconnectPrinter()}>
              {t('print.forget')}
            </Button>
          ) : null}
          <Segmented
            label={t('print.paper')}
            value={String(prefs.paper) as '58' | '80'}
            onChange={(v) => setPrefs({ paper: v === '80' ? 80 : 58 })}
            options={[
              { value: '58', label: t('printer.paper58') },
              { value: '80', label: t('printer.paper80') },
            ]}
          />
          <Segmented
            label={t('print.lang')}
            value={prefs.receiptLang}
            onChange={(v) => setPrefs({ receiptLang: v })}
            options={[
              { value: 'id', label: 'Struk: Indonesia' },
              { value: 'en', label: 'Receipt: English' },
            ]}
          />
          <Switch
            checked={prefs.autoPrint}
            onChange={(v) => setPrefs({ autoPrint: v })}
            label={t('print.auto')}
          />
          <Button
            loading={testing}
            onClick={async () => {
              setTesting(true);
              try {
                await printReceipt(sample);
                toast.success(t('print.sent'));
              } catch (e) {
                toast.error(`${t('print.failed')}: ${deviceErrorText((e as Error).message, t)}`);
              } finally {
                setTesting(false);
              }
            }}
          >
            {t('printer.testPrint')}
          </Button>
        </Section>
        <Section title={t('printer.preview')}>
          <div className="flex justify-center bg-surface-container-high py-3">
            <ReceiptPreview data={sample} />
          </div>
        </Section>
        <Section title={t('kitchen.sound')}>
          <Switch
            checked={!prefs.muted}
            onChange={(v) => setPrefs({ muted: !v })}
            label={t('kitchen.sound')}
            description={prefs.muted ? t('kitchen.soundOff') : t('kitchen.soundOn')}
          />
          <span className="text-label-medium text-on-surface-variant">{t('print.soundsHint')}</span>
          <div className="grid grid-cols-1 gap-2 medium:grid-cols-3">
            {(['order', 'kitchen', 'driver'] as const).map((k) => (
              <Button key={k} variant="outlined" size="md" icon="volume_up" onClick={() => beep(k, true)}>
                {t(`print.sound_${k}`)}
              </Button>
            ))}
          </div>
        </Section>
      </main>
    </Screen>
  );
}
