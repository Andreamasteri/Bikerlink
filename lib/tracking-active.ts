let _isTrackingActive = false;
let _pauseWatcher: (() => void) | null = null;
let _resumeWatcher: (() => void) | null = null;

export function registerLayoutWatcherCallbacks(
  pause: () => void,
  resume: () => void
): void {
  _pauseWatcher = pause;
  _resumeWatcher = resume;
}

export function setTrackingActive(value: boolean): void {
  _isTrackingActive = value;
  if (value) {
    _pauseWatcher?.();
  } else {
    _resumeWatcher?.();
  }
}

export function isTrackingActive(): boolean {
  return _isTrackingActive;
}

// ── 0-100 Sprint nav-lock broadcast ───────────────────────────────────────
let _sprintMeasuring = false;
const _sprintCallbacks: ((active: boolean) => void)[] = [];

export function setSprintMeasuringBroadcast(value: boolean): void {
  if (_sprintMeasuring === value) return;
  _sprintMeasuring = value;
  _sprintCallbacks.forEach((cb) => cb(value));
}

export function registerSprintMeasuringCallback(
  cb: (active: boolean) => void
): () => void {
  _sprintCallbacks.push(cb);
  cb(_sprintMeasuring);
  return () => {
    const idx = _sprintCallbacks.indexOf(cb);
    if (idx >= 0) _sprintCallbacks.splice(idx, 1);
  };
}

// ── Hands Off global broadcast ─────────────────────────────────────────────
let _handsOffActive = false;
const _handsOffCallbacks: ((active: boolean) => void)[] = [];

export function setHandsOffBroadcast(value: boolean): void {
  if (_handsOffActive === value) return;
  _handsOffActive = value;
  _handsOffCallbacks.forEach((cb) => cb(value));
}

export function registerHandsOffCallback(
  cb: (active: boolean) => void
): () => void {
  _handsOffCallbacks.push(cb);
  cb(_handsOffActive);
  return () => {
    const idx = _handsOffCallbacks.indexOf(cb);
    if (idx >= 0) _handsOffCallbacks.splice(idx, 1);
  };
}
