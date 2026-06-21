// ──────────────────────────────────────────────────────────────────────
// Telemetry collector state machine (Task #4588)
//
// The collector lifecycle (foreground GPS+accelerometer subscriptions vs the
// expo-location background task) used to be steered by a scatter of boolean
// refs (`activeRef`, `inBackgroundRef`) read and written from the isActive
// effect, the AppState listener and the async handoff/resume callbacks. The two
// classic bugs were (a) double collection — foreground subs and the background
// task both active during a sloppy handoff — and (b) lost samples in the
// handoff.
//
// This module turns that lifecycle into an EXPLICIT state machine with declared
// transitions:
//
//     idle ──start──▶ acquiring ──▶ foreground
//     foreground ──background──▶ background
//     background ──foreground──▶ acquiring ──▶ foreground   (drains bg buffer)
//     (any) ──stop──▶ stopping ──▶ idle                     (force flush + persist)
//
// Invariant guaranteed here, in ONE place: foreground subscriptions and the
// background task can never both be the active source. Every transition stops
// the outgoing source before starting the incoming one, and all transitions are
// serialized onto a single promise chain so a rapid background↔foreground flip
// can never interleave two handoffs.
//
// The machine is pure (no React, no native deps): all side effects are injected
// via `CollectorEffects`, so the transitions are unit-testable in isolation.
// hooks/useTelemetry.ts wires the real effects; the tests wire mocks.
// ──────────────────────────────────────────────────────────────────────

export type CollectorState =
  | "idle"        // no session
  | "acquiring"   // session created, foreground subs starting (cold start or resume)
  | "foreground"  // foreground GPS+accelerometer subs are the active source
  | "background"  // expo-location background task is the active source
  | "stopping";   // tearing down: force flush + persist + clear session

export interface CollectorEffects {
  /**
   * Begin a session: mint a session id, reset GPS fallback refs, drain any
   * samples persisted by a previous failed stop, and persist the session key so
   * the background task can tag its samples. Does NOT open foreground subs.
   */
  beginSession: () => Promise<void>;
  /** Open GPS + accelerometer subscriptions and start the sensor/flush timers. */
  startForeground: () => Promise<void>;
  /** Remove subscriptions and clear timers (synchronous, best-effort). */
  stopForeground: () => void;
  /**
   * Flush the foreground buffer. `force` is retained for call-site clarity.
   * The resolved value (true when a batch was sent) is ignored by the machine.
   */
  flush: (force: boolean) => Promise<unknown>;
  /** Start the expo-location background task. Returns true if it started. */
  startBackground: () => Promise<boolean>;
  /** Stop the expo-location background task (best-effort). */
  stopBackground: () => Promise<void>;
  /** Drain the AsyncStorage background buffer and flush it to the server. */
  drainBackground: () => Promise<void>;
  /**
   * Finish the session: force-flush the foreground buffer (with retry), persist
   * anything still unsent to AsyncStorage, then clear the session id/buffer and
   * the background session key. Never drops samples silently.
   */
  finishSession: () => Promise<void>;
}

export interface TelemetryCollectorMachine {
  /** Current state — the single source of truth for the collector lifecycle. */
  getState: () => CollectorState;
  /** idle → acquiring → foreground. No-op unless currently idle. */
  start: () => void;
  /** foreground → background. No-op unless currently foreground. */
  toBackground: () => void;
  /** background → foreground (drains bg buffer). No-op unless currently background. */
  toForeground: () => void;
  /** (any non-idle) → stopping → idle. Returns the settling promise. */
  stop: () => Promise<void>;
  /** Resolves once the current serialized transition chain has drained (tests). */
  settled: () => Promise<void>;
}

export function createTelemetryCollector(fx: CollectorEffects): TelemetryCollectorMachine {
  let state: CollectorState = "idle";
  // Serializes async transitions so handoff/resume can never overlap. A flip
  // queued mid-transition runs only after the in-flight one settles, so the
  // background task can never start after the foreground has already resumed.
  let chain: Promise<void> = Promise.resolve();

  const enqueue = (fn: () => Promise<void>): Promise<void> => {
    chain = chain.then(fn).catch(() => {});
    return chain;
  };

  async function doStart(): Promise<void> {
    if (state !== "idle") return;
    state = "acquiring";
    await fx.beginSession();
    if (state !== "acquiring") return; // a stop was interleaved
    await fx.startForeground();
    if (state !== "acquiring") return;
    state = "foreground";
  }

  async function doToBackground(): Promise<void> {
    if (state !== "foreground") return;
    // INVARIANT: stop the foreground source BEFORE the background task starts.
    fx.stopForeground();
    await fx.flush(true); // never carry the foreground buffer across the handoff
    const started = await fx.startBackground();
    if (started) {
      state = "background";
      return;
    }
    // Background permission denied → degrade to a full, durable stop instead of
    // silently dropping the in-flight buffer.
    state = "stopping";
    await fx.finishSession();
    state = "idle";
  }

  async function doToForeground(): Promise<void> {
    if (state !== "background") return;
    state = "acquiring";
    // INVARIANT: stop the background task and drain its buffer BEFORE restarting
    // foreground subs — there must be no window where both collect.
    await fx.stopBackground();
    await fx.drainBackground();
    if (state !== "acquiring") return; // a stop was interleaved
    await fx.startForeground();
    if (state !== "acquiring") return;
    state = "foreground";
  }

  async function doStop(): Promise<void> {
    if (state === "idle" || state === "stopping") return;
    const hadForeground = state === "foreground" || state === "acquiring";
    state = "stopping";
    if (hadForeground) fx.stopForeground();
    // Always ensure the background task is stopped and its buffer drained before
    // finishing — defensive: the task must never outlive the session, and any
    // samples it captured must be flushed before the session id is cleared.
    await fx.stopBackground();
    await fx.drainBackground();
    await fx.finishSession();
    state = "idle";
  }

  return {
    getState: () => state,
    start: () => { enqueue(doStart); },
    toBackground: () => { enqueue(doToBackground); },
    toForeground: () => { enqueue(doToForeground); },
    stop: () => enqueue(doStop),
    settled: () => chain,
  };
}
