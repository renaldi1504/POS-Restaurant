/**
 * Kelas ukuran jendela M3 (SKILL §8b): compact < 600 px (HP), medium 600–839 (tablet kecil / HP landscape),
 * expanded ≥ 840 (tablet landscape). Sama dengan breakpoint CSS `medium:` / `expanded:` di m3.css.
 */
import { useSyncExternalStore } from 'react';

export type WindowSizeClass = 'compact' | 'medium' | 'expanded';

export const MEDIUM_MIN = 600;
export const EXPANDED_MIN = 840;

export function sizeClassFor(width: number): WindowSizeClass {
  if (width >= EXPANDED_MIN) return 'expanded';
  if (width >= MEDIUM_MIN) return 'medium';
  return 'compact';
}

function current(): WindowSizeClass {
  return typeof window === 'undefined' ? 'compact' : sizeClassFor(window.innerWidth);
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('resize', cb);
  window.addEventListener('orientationchange', cb);
  return () => {
    window.removeEventListener('resize', cb);
    window.removeEventListener('orientationchange', cb);
  };
}

export function useWindowSizeClass(): WindowSizeClass {
  return useSyncExternalStore(subscribe, current, () => 'compact');
}
