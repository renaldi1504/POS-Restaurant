import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { buildReceipt, previewLines, usePrinterStatus, type DocLine, type ReceiptData } from '../../lib/printer';
import { paperCols, printDoc, printReceipt } from '../../lib/print';
import { getPrefs } from '../../lib/prefs';
import { useToast } from '../ui';

/** Pratinjau kertas thermal (monospace), identik dengan teks yang dicetak. */
export function ReceiptPreview({ data, doc }: { data?: ReceiptData; doc?: DocLine[] }) {
  const cols = paperCols();
  const lines = previewLines(doc ?? (data ? buildReceipt(data, cols) : []), cols);
  return (
    <div
      data-testid="receipt-preview"
      aria-label="Pratinjau struk"
      className="self-center bg-white px-4 pb-6 pt-5 font-mono text-[12px] leading-[1.55] text-ink shadow-[0_4px_16px_rgba(16,24,40,0.12)]"
      style={{ width: `${cols + 4}ch` }}
    >
      {lines.map((l, i) => (
        <div key={i} className={l.bold ? 'font-bold' : undefined} style={{ whiteSpace: 'pre' }}>
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
        toast.error(`${t('print.failed')}: ${(e as Error).message}`);
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
