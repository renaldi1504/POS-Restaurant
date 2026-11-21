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
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
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

/** Dua nada pendek "ding-dong". */
export function beep(kind: 'order' | 'kitchen' | 'ok' = 'order', force = false): void {
  if (!force && getPrefs().muted) return;
  const a = audio();
  if (!a) return;
  const tones = kind === 'ok' ? [880] : kind === 'kitchen' ? [988, 740, 988] : [880, 660];
  tones.forEach((freq, i) => {
    const t0 = a.currentTime + i * 0.22;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + 0.22);
  });
}

/** Bunyi berulang selama `active` (interval ms). Berhenti otomatis saat bisu. */
export function useRepeatingAlarm(active: boolean, kind: 'order' | 'kitchen' = 'order', intervalMs = 4000): void {
  const { muted } = usePrefs();
  useEffect(() => {
    if (!active || muted) return;
    beep(kind);
    const id = window.setInterval(() => beep(kind), intervalMs);
    return () => window.clearInterval(id);
  }, [active, muted, kind, intervalMs]);
}
