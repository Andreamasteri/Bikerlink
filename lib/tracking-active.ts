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
