/** Akses sessionStorage/localStorage yang aman (mode privat / webview tanpa storage → diam saja). */
type Kind = 'session' | 'local';

function store(kind: Kind): Storage | null {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(kind: Kind, key: string, fallback: T): T {
  try {
    const raw = store(kind)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(kind: Kind, key: string, value: unknown): void {
  try {
    store(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    /* penuh / diblokir */
  }
}

export function removeKey(kind: Kind, key: string): void {
  try {
    store(kind)?.removeItem(key);
  } catch {
    /* abaikan */
  }
}
