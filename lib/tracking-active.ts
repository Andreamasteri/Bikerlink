import AsyncStorage from "@react-native-async-storage/async-storage";

const TRACKING_ACTIVE_KEY = "@bikerlink/tracking_active";

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

// ── Tracking Active broadcast ──────────────────────────────────────────────
const _trackingActiveCallbacks: ((active: boolean) => void)[] = [];

export function setTrackingActive(value: boolean): void {
  _isTrackingActive = value;
  if (value) {
    _pauseWatcher?.();
  } else {
    _resumeWatcher?.();
  }
  _trackingActiveCallbacks.forEach((cb) => cb(value));

  AsyncStorage.setItem(TRACKING_ACTIVE_KEY, value ? "true" : "false").catch(() => {});
}

export function isTrackingActive(): boolean {
  return _isTrackingActive;
}

export function registerTrackingActiveCallback(
  cb: (active: boolean) => void
): () => void {
  _trackingActiveCallbacks.push(cb);
  cb(_isTrackingActive);
  return () => {
    const idx = _trackingActiveCallbacks.indexOf(cb);
    if (idx >= 0) _trackingActiveCallbacks.splice(idx, 1);
  };
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
let _handsOffThresholdKmh = 50;
const _handsOffCallbacks: ((active: boolean, thresholdKmh: number) => void)[] = [];

export function setHandsOffBroadcast(value: boolean, thresholdKmh?: number): void {
  if (thresholdKmh !== undefined) _handsOffThresholdKmh = thresholdKmh;
  const changed = _handsOffActive !== value;
  _handsOffActive = value;
  if (changed) {
    _handsOffCallbacks.forEach((cb) => cb(value, _handsOffThresholdKmh));
  }
}

export function registerHandsOffCallback(
  cb: (active: boolean, thresholdKmh: number) => void
): () => void {
  _handsOffCallbacks.push(cb);
  cb(_handsOffActive, _handsOffThresholdKmh);
  return () => {
    const idx = _handsOffCallbacks.indexOf(cb);
    if (idx >= 0) _handsOffCallbacks.splice(idx, 1);
  };
}
