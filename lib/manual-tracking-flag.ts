let _active = false;
const _subscribers = new Set<() => void>();

export function setManualTrackingActive(active: boolean): void {
  if (_active !== active) {
    _active = active;
    _subscribers.forEach((fn) => fn());
  }
}

export function getManualTrackingActive(): boolean {
  return _active;
}

export function subscribeManualTracking(fn: () => void): () => void {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}
