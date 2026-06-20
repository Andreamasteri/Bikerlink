// ──────────────────────────────────────────────────────────────────────
// Resume-path helpers (Task #4585)
//
// Non-React-Query resume flows (permission checks via the native bridge,
// AsyncStorage drains, telemetry flushes) can stall indefinitely on a wedged
// native call or saturated storage. `withTimeout` races a promise against a
// timer so a stalled operation rejects instead of leaving the resume sequence
// hanging. The caller is responsible for catching the rejection (these flows
// must degrade silently, never crash).
// ──────────────────────────────────────────────────────────────────────

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
