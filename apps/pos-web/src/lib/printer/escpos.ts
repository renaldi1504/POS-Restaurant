/**
 * Encoder ESC/POS minimal (tanpa dependency). Hanya ASCII: teks lain ditransliterasi / dibuang
 * karena printer thermal murah umumnya hanya punya code page Latin.
 *
 *   const e = new EscPos(32).init().align('center').bold(true).line('RM BERKAT').bold(false).cut();
 *   transport.write(e.encode());
 */

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

/** Lebar kolom per ukuran kertas (font A). */
export const PAPER_COLUMNS = { 58: 32, 80: 48 } as const;

export type Align = 'left' | 'center' | 'right';

const MAP: Record<string, string> = {
  '៛': 'KHR',
  '€': 'EUR',
  '£': 'GBP',
  '–': '-',
  '—': '-',
  '−': '-',
  '·': '-',
  '•': '*',
  '…': '...',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '≈': '~',
  '×': 'x',
  '✓': 'v',
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ł: 'l',
  Ł: 'L',
};

/** Ubah teks ke ASCII yang bisa dicetak: hapus diakritik, ganti simbol umum, buang aksara non-Latin. */
export function toAscii(input: string): string {
  let out = '';
  for (const ch of input) {
    const mapped = MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    for (const b of base) {
      const code = b.charCodeAt(0);
      if (code === 0x09) out += ' ';
      else if (code >= 0x20 && code <= 0x7e) out += b;
      // selain itu (Khmer, CJK, emoji, kontrol) dibuang
    }
  }
  return out.replace(/ {2,}/g, (m) => m); // pertahankan spasi (dipakai untuk perataan)
}

export class EscPos {
  private bytes: number[] = [];
  constructor(public readonly cols: number = 32) {}

  raw(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }
  /** ESC @ — reset printer. */
  init(): this {
    return this.raw(ESC, 0x40);
  }
  /** ESC a n — perataan. */
  align(a: Align): this {
    return this.raw(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
  }
  /** ESC E n — tebal. */
  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  /** GS ! n — ukuran karakter (1–8 kali lebar/tinggi). */
  size(width: number = 1, height: number = 1): this {
    const w = Math.min(8, Math.max(1, Math.round(width))) - 1;
    const h = Math.min(8, Math.max(1, Math.round(height))) - 1;
    return this.raw(GS, 0x21, (w << 4) | h);
  }
  /** Ukuran ganda (lebar & tinggi). */
  double(on: boolean): this {
    return on ? this.size(2, 2) : this.size(1, 1);
  }
  text(s: string): this {
    for (const ch of toAscii(s)) this.bytes.push(ch.charCodeAt(0));
    return this;
  }
  line(s: string = ''): this {
    return this.text(s).raw(LF);
  }
  /** ESC d n — maju n baris. */
  feed(n: number = 1): this {
    return this.raw(ESC, 0x64, Math.min(255, Math.max(0, n)));
  }
  /** GS V 66 n — maju n baris lalu potong (partial cut). */
  cut(feedLines: number = 3): this {
    return this.raw(GS, 0x56, 0x42, Math.min(255, Math.max(0, feedLines)));
  }
  encode(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

// ---------------- Helper tata letak kolom (dipakai template & pratinjau) ----------------

/** Potong teks menjadi baris ≤ width (pecah di spasi bila bisa). */
export function wrap(text: string, width: number): string[] {
  const words = toAscii(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let cur = '';
  for (let w of words) {
    while (w.length > width) {
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!w) continue;
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Dua kolom: kiri (dibungkus) + kanan rata kanan di baris terakhir. Semua baris tepat `width` karakter. */
export function twoCol(left: string, right: string, width: number, indent = 0): string[] {
  const r = toAscii(right);
  const pad = ' '.repeat(indent);
  const avail = Math.max(1, width - r.length - 1 - indent);
  const parts = wrap(left, avail);
  return parts.map((p, i) => {
    const l = pad + p;
    if (i < parts.length - 1) return l.padEnd(width, ' ');
    return l + ' '.repeat(Math.max(1, width - l.length - r.length)) + r;
  });
}

export function center(text: string, width: number): string[] {
  return wrap(text, width).map((l) => {
    const left = Math.floor((width - l.length) / 2);
    return (' '.repeat(Math.max(0, left)) + l).padEnd(width, ' ');
  });
}

export function rule(width: number, ch = '-'): string {
  return ch.repeat(width);
}
