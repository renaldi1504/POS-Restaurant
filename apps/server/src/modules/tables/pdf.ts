/**
 * PDF kartu QR meja (pdfkit + qrcode). A4, 4 kartu per halaman (2×2).
 * Teks hanya Latin (font bawaan Helvetica) supaya tidak crash tanpa font Khmer/CJK.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface QrCard {
  tableName: string;
  area: string;
  url: string;
}

export interface QrPdfOptions {
  restaurantName: string;
  /** Path file logo lokal (PNG/JPG) bila ada. */
  logoPath?: string | null;
}

/** Resolve logo lokal dari URL `/uploads/public/...` (R2/remote dilewati). */
export function localLogoPath(logoUrl: string | null | undefined, uploadDir: string): string | null {
  if (!logoUrl) return null;
  const m = /^\/uploads\/public\/(.+\.(png|jpe?g))$/i.exec(logoUrl);
  if (!m || m[1]!.includes('..')) return null;
  const full = path.join(path.resolve(uploadDir), 'public', m[1]!);
  return existsSync(full) ? full : null;
}

export async function renderTablesQrPdf(cards: QrCard[], opts: QrPdfOptions): Promise<Buffer> {
  const qrs = await Promise.all(
    cards.map((c) =>
      QRCode.toBuffer(c.url, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 600 }),
    ),
  );
  let logo: Buffer | null = null;
  if (opts.logoPath) {
    try {
      logo = readFileSync(opts.logoPath);
    } catch {
      logo = null;
    }
  }

  const doc = new PDFDocument({
    size: 'A4',
    margin: 24,
    info: { Title: `QR Meja - ${opts.restaurantName}` },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 24;
  const gap = 16;
  const cardW = (pageW - margin * 2 - gap) / 2;
  const cardH = (pageH - margin * 2 - gap) / 2;

  if (!cards.length) {
    doc.font('Helvetica').fontSize(16).text('Tidak ada meja aktif', margin, margin);
  }

  cards.forEach((card, i) => {
    const pos = i % 4;
    if (i > 0 && pos === 0) doc.addPage();
    const x = margin + (pos % 2) * (cardW + gap);
    const y = margin + Math.floor(pos / 2) * (cardH + gap);
    doc.save();
    doc.roundedRect(x, y, cardW, cardH, 14).lineWidth(1.5).strokeColor('#047857').stroke();
    doc.restore();

    let cy = y + 18;
    if (logo) {
      try {
        doc.image(logo, x + cardW / 2 - 22, cy, { fit: [44, 44] });
        cy += 50;
      } catch {
        /* logo tidak valid → lewati */
      }
    }
    doc
      .fillColor('#101828')
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(opts.restaurantName, x + 12, cy, { width: cardW - 24, align: 'center' });
    cy = doc.y + 6;
    doc
      .fillColor('#047857')
      .font('Helvetica-Bold')
      .fontSize(26)
      .text(card.tableName, x + 12, cy, { width: cardW - 24, align: 'center' });
    cy = doc.y + 2;
    if (card.area) {
      doc
        .fillColor('#667085')
        .font('Helvetica')
        .fontSize(11)
        .text(card.area, x + 12, cy, { width: cardW - 24, align: 'center' });
      cy = doc.y + 6;
    }
    const footerH = 54;
    const qrSize = Math.max(80, Math.min(cardW - 60, y + cardH - footerH - cy - 8));
    doc.image(qrs[i]!, x + (cardW - qrSize) / 2, cy, { width: qrSize, height: qrSize });
    cy += qrSize + 8;
    doc
      .fillColor('#101828')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('Scan untuk pesan · Scan to order', x + 12, cy, { width: cardW - 24, align: 'center' });
    doc
      .fillColor('#98A2B3')
      .font('Helvetica')
      .fontSize(7)
      .text(card.url, x + 12, doc.y + 4, { width: cardW - 24, align: 'center' });
  });

  doc.end();
  return done;
}
