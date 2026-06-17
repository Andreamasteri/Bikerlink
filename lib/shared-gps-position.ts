type Coords = { latitude: number; longitude: number };
type Listener = (coords: Coords) => void;

const listeners = new Set<Listener>();
let _lastPosition: Coords | null = null;

export function emitGpsPosition(coords: Coords): void {
  _lastPosition = coords;
  listeners.forEach((l) => {
    try { l(coords); } catch { /* no-op */ }
  });
}

export function subscribeGpsPosition(listener: Listener): () => void {
  listeners.add(listener);
  if (_lastPosition) {
    try { listener(_lastPosition); } catch { /* no-op */ }
  }
  return () => { listeners.delete(listener); };
}

export function getLastGpsPosition(): Coords | null {
  return _lastPosition;
}
