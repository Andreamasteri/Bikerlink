type Listener = () => void;

const _listeners = new Set<Listener>();

export function onMatchNotification(fn: Listener): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

export function emitMatchNotification(): void {
  _listeners.forEach((fn) => fn());
}
