import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  buildReceipt,
  previewLines,
  usePrinterStatus,
  type DocLine,
  type ReceiptData,
} from '../../lib/printer';
import { paperCols, printDoc, printReceipt } from '../../lib/print';
import { getPrefs } from '../../lib/prefs';
import { deviceErrorText } from '../../lib/api';
import { useToast } from '../ui';

/** Pratinjau kertas thermal (monospace), identik dengan teks yang dicetak. */
export function ReceiptPreview({ data, doc }: { data?: ReceiptData; doc?: DocLine[] }) {
  const { t } = useTranslation();
  const cols = paperCols();
  const lines = previewLines(doc ?? (data ? buildReceipt(data, cols) : []), cols);
  return (
    <div
      data-testid="receipt-preview"
      aria-label={t('print.receiptPreview')}
      className="self-center bg-surface-container-lowest px-4 pb-6 pt-5 font-mono text-[12px] leading-[1.55] text-black shadow-e2"
      style={{ width: `${cols + 4}ch` }}
    >
      {lines.map((l, i) => (
        <div key={i} className={l.bold ? 'font-medium' : undefined} style={{ whiteSpace: 'pre' }}>
          {l.text || ' '}
        </div>
      ))}
    </div>
  );
}

/** Cetak dengan toast; bila printer belum terhubung tawarkan halaman Printer. */
export function usePrint() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const status = usePrinterStatus();
  const run = useCallback(
    async (job: () => Promise<void>): Promise<boolean> => {
      if (getPrefs().printer === 'none') {
        toast.error(t('print.notConnected'));
        navigate('/printer');
        return false;
      }
      try {
        await job();
        toast.success(t('print.sent'));
        return true;
      } catch (e) {
        toast.error(`${t('print.failed')}: ${deviceErrorText((e as Error).message, t)}`);
        return false;
      }
    },
    [t, toast, navigate],
  );
  return {
    status,
    printReceipt: (d: ReceiptData) => run(() => printReceipt(d)),
    printDoc: (d: DocLine[]) => run(() => printDoc(d)),
  };
}
