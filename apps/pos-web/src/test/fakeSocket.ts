type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Set<Handler>>();

const socket = {
  connected: false,
  on(ev: string, fn: Handler) {
    if (!handlers.has(ev)) handlers.set(ev, new Set());
    handlers.get(ev)!.add(fn);
    return socket;
  },
  off(ev: string, fn: Handler) {
    handlers.get(ev)?.delete(fn);
    return socket;
  },
  onAny() {
    return socket;
  },
  emit() {
    return socket;
  },
  connect() {
    return socket;
  },
  disconnect() {
    return socket;
  },
};

export function fakeIo() {
  return socket;
}

/** Picu event server → klien di test. */
export function emitSocket(ev: string, payload: unknown) {
  handlers.get(ev)?.forEach((fn) => fn(payload));
}
