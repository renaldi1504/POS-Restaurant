/**
 * Bunyi notifikasi dengan Web Audio (tanpa file). `useRepeatingAlarm(active)` berbunyi tiap beberapa detik
 * sampai `active` false (mis. order online sudah dibuka). Menghormati pengaturan bisu per perangkat.
 */
import { useEffect } from 'react';
import { getPrefs, usePrefs } from './prefs';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  // Sebelum ada interaksi pengguna, browser memblokir audio (dan memberi peringatan bila AudioContext
  // dibuat). Lewati dulu; alarm berulang akan berbunyi setelah layar disentuh.
  if (!ctx && !userActivated()) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

function userActivated(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

/** Buka kunci audio setelah interaksi pertama (kebijakan autoplay browser). */
export function unlockAudio(): void {
  audio();
}
if (typeof window !== 'undefined') {
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}

export type SoundKind = 'order' | 'kitchen' | 'driver' | 'ok';

interface Note {
  /** Detik dari mulai. */
  at: number;
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  /** Nada tambahan (kelipatan frekuensi) untuk warna bunyi lonceng. */
  partials?: number[];
}

/**
 * Tiap jenis bunyi dibuat jelas berbeda supaya staf tahu dari jauh:
 * - order  (kasir, order online masuk): "ding-ding-DING" naik, cerah (triangle)
 * - kitchen (dapur, pesanan baru): lonceng meja dapur "TING… TING" bergema panjang
 * - driver (pesanan siap diantar): dua bip rendah pendek "tut-tut" (square)
 * - ok: satu nada konfirmasi pendek
 */
export const SOUNDS: Record<SoundKind, Note[]> = {
  order: [
    { at: 0, freq: 1047, dur: 0.14, type: 'triangle', gain: 0.45 },
    { at: 0.15, freq: 1319, dur: 0.14, type: 'triangle', gain: 0.45 },
    { at: 0.3, freq: 1568, dur: 0.35, type: 'triangle', gain: 0.5 },
  ],
  kitchen: [
    { at: 0, freq: 830, dur: 1.1, type: 'sine', gain: 0.55, partials: [2.76, 5.4] },
    { at: 0.55, freq: 830, dur: 1.2, type: 'sine', gain: 0.55, partials: [2.76, 5.4] },
  ],
  driver: [
    { at: 0, freq: 392, dur: 0.12, type: 'square', gain: 0.18 },
    { at: 0.2, freq: 392, dur: 0.12, type: 'square', gain: 0.18 },
  ],
  ok: [{ at: 0, freq: 880, dur: 0.18, type: 'sine', gain: 0.4 }],
};

function playNote(a: AudioContext, n: Note): void {
  const t0 = a.currentTime + n.at;
  for (const [i, mult] of [1, ...(n.partials ?? [])].entries()) {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = n.type;
    osc.frequency.value = n.freq * mult;
    const peak = n.gain / (i + 1.5);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(i === 0 ? n.gain : peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.02);
  }
}

/** Bunyikan notifikasi (menghormati bisu per perangkat kecuali `force`). */
export function beep(kind: SoundKind = 'order', force = false): void {
  if (!force && getPrefs().muted) return;
  const a = audio();
  if (!a) return;
  for (const n of SOUNDS[kind]) playNote(a, n);
}

/** Bunyi berulang selama `active` (interval ms). Berhenti otomatis saat bisu. */
export function useRepeatingAlarm(active: boolean, kind: SoundKind = 'order', intervalMs = 4000): void {
  const { muted } = usePrefs();
  useEffect(() => {
    if (!active || muted) return;
    beep(kind);
    const id = window.setInterval(() => beep(kind), intervalMs);
    return () => window.clearInterval(id);
  }, [active, muted, kind, intervalMs]);
}
