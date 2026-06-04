export interface MatchNotifPayload {
  matchName?: string;
  thumbnailUrl?: string;
}

type Listener = (data?: MatchNotifPayload) => void;

const _listeners = new Set<Listener>();

export function onMatchNotification(fn: Listener): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

export function emitMatchNotification(data?: MatchNotifPayload): void {
  _listeners.forEach((fn) => fn(data));
}
