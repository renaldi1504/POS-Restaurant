/** Cetak struk / nota sementara / laporan dengan preferensi printer perangkat. */
import { PAPER_COLUMNS, buildReceipt, printBytes, renderEscPos, type DocLine, type ReceiptData } from './printer';
import { getPrefs } from './prefs';

export function paperCols(): number {
  return PAPER_COLUMNS[getPrefs().paper];
}

export async function printReceipt(data: ReceiptData): Promise<void> {
  const cols = paperCols();
  await printBytes(renderEscPos(buildReceipt(data, cols), cols));
}

export async function printDoc(doc: DocLine[]): Promise<void> {
  const cols = paperCols();
  await printBytes(renderEscPos(doc, cols));
}
