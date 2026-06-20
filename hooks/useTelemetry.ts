import { useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, queryClient } from "@/lib/query-client";
import {
  BG_TELEMETRY_SESSION_KEY,
  startTelemetryBackgroundTask,
  stopTelemetryBackgroundTask,
  drainBackgroundTelemetryBuffer,
} from "@/lib/background-telemetry-task";
import {
  createTelemetryCollector,
  type TelemetryCollectorMachine,
} from "@/lib/telemetry-collector-machine";
import {
  TRACKING_FUSION,
  shouldRecordSensorSample,
  type TelemetrySample,
} from "@shared/tracking-fusion";

// ─── Constants ────────────────────────────────────────────────────────────────
const SAMPLE_INTERVAL_MS  = 1000;   // 1 Hz
// Single source of truth: shared/tracking-fusion.ts. Re-exported so existing
// callers/tests keep importing GPS_SILENCE_MS from this module.
export const GPS_SILENCE_MS = TRACKING_FUSION.GPS_SILENCE_MS; // no GPS fix this long → record sensor-only

/**
 * Returns true when the sensor-only timer SHOULD add a sample.
 * Condition: no GPS fix has arrived for longer than GPS_SILENCE_MS.
 * Called by the sensorTimer inside startForegroundSubs; exported so tests
 * exercise the same production function without reimplementing the logic.
 * Delegates to the shared fusion module (single source of truth).
 */
export function shouldAddSensorSample(lastGpsTsMs: number, nowMs: number = Date.now()): boolean {
  return shouldRecordSensorSample(lastGpsTsMs, nowMs);
}
const FLUSH_INTERVAL_MS   = 30_000; // periodic flush every 30 s (was 90 s)
const FLUSH_MIN_SAMPLES   = 5;      // min samples before a periodic flush fires (was 50)
const FLUSH_MAX_SAMPLES   = 200;    // hard cap — flush immediately at this count
const STOP_RETRY_DELAY_MS = 1_500;  // pause before retry flush on stopSession failure
// Resume-path caps for the background buffer drain (Task #4585): bound the whole
// drain and each individual chunk POST so a slow network on resume cannot stall
// the foreground resume sequence indefinitely.
const BG_DRAIN_BUDGET_MS         = 12_000;
const BG_DRAIN_REQUEST_TIMEOUT_MS = 8_000;
// AsyncStorage key prefix for samples persisted across sessions on flush failure.
const UNSENT_PREFIX = "@bikerlink/telemetry_unsent_";

// ─── Types ────────────────────────────────────────────────────────────────────
// TelemetrySample is the canonical shape from @shared/tracking-fusion (imported
// above). Re-exported so existing callers can keep importing it from this module.
export type { TelemetrySample };

interface AccelReading {
  x: number;
  y: number;
  z: number;
}

// ─── UUID v4 (no external deps) ───────────────────────────────────────────────
function makeUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function calcLeanAngle(x: number, z: number): number {
  return (Math.atan2(x, Math.abs(z)) * 180) / Math.PI;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
/**
 * useTelemetry — collects GPS + accelerometer at 1 Hz while isActive is true,
 * buffers samples, and flushes batches to POST /api/telemetry/batch.
 *
 * @param isActive  — true while the tracking session should be running
 * @param externalGps — when true, skip opening a second watchPositionAsync
 *   (caller must feed location updates via the returned pushLocation callback).
 *   This prevents the double-subscription conflict when tracking.tsx already
 *   has its own watchPositionAsync open.
 *
 * Lifecycle — driven by the explicit state machine in
 * lib/telemetry-collector-machine.ts (idle → acquiring → foreground ↔
 * background → stopping). The machine guarantees foreground subscriptions and
 * the background task can never both be the active source, and serializes the
 * foreground↔background handoff so no samples are lost or duplicated:
 *  - isActive true  → machine.start(): new session (new UUID, fresh buffer),
 *                     unsent-storage drain, then foreground subs.
 *  - isActive false → machine.stop(): subs/bg-task torn down, background buffer
 *                     drained, remaining foreground buffer force-flushed/persisted.
 *  - App backgrounding → machine.toBackground(): foreground subs stopped and
 *                     flushed, then the background task (TASK_TELEMETRY) takes over.
 *  - App foregrounding → machine.toForeground(): background task stopped, its
 *                     buffer drained/flushed, then foreground subs restarted.
 *  - Component unmount → machine.stop() (best-effort, fire-and-forget).
 */
export function useTelemetry(isActive: boolean, externalGps = false) {
  const sessionIdRef   = useRef<string | null>(null);
  const bufferRef      = useRef<TelemetrySample[]>([]);
  const accelRef       = useRef<AccelReading>({ x: 0, y: 0, z: 1 });
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef    = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const flushTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  // Independent 1 Hz timer that records sensor-only samples when GPS is silent.
  const sensorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Last known GPS fix coords — reused when no fresh fix is available.
  const lastKnownLocRef = useRef<{ lat: number; lon: number } | null>(null);
  // Timestamp (ms) of the most recent GPS fix, used to detect GPS silence.
  const lastGpsTsRef    = useRef<number>(0);
  const isFlushing      = useRef(false);
  // The collector state machine — single source of truth for the lifecycle.
  // Created lazily (once) so the injected effects close over the stable refs.
  const machineRef      = useRef<TelemetryCollectorMachine | null>(null);
  // Stable ref to externalGps flag so callbacks don't capture a stale closure.
  const externalGpsRef  = useRef(externalGps);
  useEffect(() => { externalGpsRef.current = externalGps; }, [externalGps]);

  // True while foreground subs are the active source. "acquiring" is included so
  // a fix that arrives in the brief window before the machine flips to
  // "foreground" (cold start / resume) is not dropped. Background and stopping
  // states return false so the foreground sampler never runs alongside the
  // background task.
  const canRecordForeground = useCallback((): boolean => {
    const s = machineRef.current?.getState();
    return s === "foreground" || s === "acquiring";
  }, []);

  // ── flush foreground buffer to server ─────────────────────────────────────
  // force=true → send even when below FLUSH_MIN_SAMPLES (used for stop/background)
  // force=false → respect FLUSH_MIN_SAMPLES gate (used for periodic timer)
  const flush = useCallback(async (force: boolean) => {
    if (isFlushing.current) return;
    const buf = bufferRef.current;
    if (buf.length === 0) return;
    if (!force && buf.length < FLUSH_MIN_SAMPLES) return;

    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    const toSend = bufferRef.current.splice(0, FLUSH_MAX_SAMPLES);
    isFlushing.current = true;

    try {
      await apiRequest("POST", "/api/telemetry/batch", {
        session_id:   sessionId,
        session_type: "ride",
        samples:      toSend,
      });
      // Refresh km counter right after samples are persisted
      queryClient.invalidateQueries({ queryKey: ["/api/telemetry/stats"] });
    } catch (err) {
      // Re-queue on network/auth failure to avoid data loss
      bufferRef.current = [...toSend, ...bufferRef.current];
      console.warn("[useTelemetry] flush failed, re-queued", err);
    } finally {
      isFlushing.current = false;
    }
  }, []);

  // ── drain AsyncStorage background buffer and flush to server ───────────────
  const drainAndFlushBackgroundBuffer = useCallback(async () => {
    const bgSamples = await drainBackgroundTelemetryBuffer();
    if (bgSamples.length === 0) return;

    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    // Overall duration cap: on a slow/resuming network this drain runs inside
    // the resume sequence — without a deadline a large backlog of chunks could
    // keep the resume blocked for tens of seconds. Each chunk POST is also
    // bounded so one wedged request can't stall the whole drain.
    const deadline = Date.now() + BG_DRAIN_BUDGET_MS;

    // Send in FLUSH_MAX_SAMPLES chunks
    let offset = 0;
    while (offset < bgSamples.length) {
      if (Date.now() > deadline) {
        console.warn("[useTelemetry] background buffer drain budget exceeded, deferring rest");
        break;
      }
      const chunk = bgSamples.slice(offset, offset + FLUSH_MAX_SAMPLES);
      offset += FLUSH_MAX_SAMPLES;
      try {
        await apiRequest("POST", "/api/telemetry/batch", {
          session_id:   sessionId,
          session_type: "ride",
          samples:      chunk,
        }, { timeoutMs: BG_DRAIN_REQUEST_TIMEOUT_MS });
      } catch (err) {
        console.warn("[useTelemetry] background buffer flush failed", err);
        break; // stop on first error; remaining samples will be lost (acceptable trade-off)
      }
    }
  }, []);

  // ── internal teardown (subscriptions + timer, foreground only) ────────────
  const teardown = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (sensorTimerRef.current) {
      clearInterval(sensorTimerRef.current);
      sensorTimerRef.current = null;
    }
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }
  }, []);

  // ── persist unsent samples to AsyncStorage on flush failure ──────────────
  // Called when finishSession's flush fails (auth / network). Samples are stored
  // under a session-keyed entry and drained at the start of the next session.
  const persistUnsentSamples = useCallback(async (
    sessionId: string,
    samples: TelemetrySample[]
  ) => {
    const key = `${UNSENT_PREFIX}${sessionId}`;
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ sessionId, samples }));
      console.warn(
        `[useTelemetry] stop: ${samples.length} campioni persistiti in AsyncStorage (${key}) — saranno inviati alla prossima sessione.`
      );
    } catch (e) {
      console.warn(
        `[useTelemetry] stop: ${samples.length} campioni NON inviati — persist AsyncStorage fallito. Dati persi.`,
        e
      );
    }
  }, []);

  // ── build a sample from a Location.LocationObject + current accelerometer ──
  const buildSample = useCallback((loc: Location.LocationObject): TelemetrySample => {
    const { latitude, longitude, altitude, speed, heading } = loc.coords;
    const accel = accelRef.current;

    // Remember this fix so sensor-only samples can reuse the last known coords.
    lastKnownLocRef.current = { lat: latitude, lon: longitude };
    lastGpsTsRef.current    = Date.now();

    const sample: TelemetrySample = {
      ts:  loc.timestamp,
      lat: latitude,
      lon: longitude,
    };

    if (speed != null && speed >= 0) {
      sample.speed_kmh = speed * 3.6;
    }
    if (altitude != null) {
      sample.altitude_m = altitude;
    }
    if (heading != null && heading >= 0) {
      sample.heading = heading;
    }
    sample.gforce_x   = accel.x;
    sample.gforce_y   = accel.y;
    sample.gforce_z   = accel.z;
    sample.lean_angle = calcLeanAngle(accel.x, accel.z);

    return sample;
  }, []);

  // ── build a sensor-only sample (no fresh GPS fix) ─────────────────────────
  // Uses the last known GPS coords if any (else null) + current accelerometer.
  const buildSensorSample = useCallback((): TelemetrySample => {
    const accel = accelRef.current;
    const last  = lastKnownLocRef.current;

    return {
      ts:        Date.now(),
      lat:       last ? last.lat : null,
      lon:       last ? last.lon : null,
      gforce_x:  accel.x,
      gforce_y:  accel.y,
      gforce_z:  accel.z,
      lean_angle: calcLeanAngle(accel.x, accel.z),
    };
  }, []);

  // ── accept an externally-provided location update ─────────────────────────
  // Called by the parent (tracking.tsx) when externalGps=true so we never
  // open a second watchPositionAsync alongside the one the screen already has.
  const pushLocation = useCallback((loc: Location.LocationObject) => {
    if (!canRecordForeground()) return;

    const sample = buildSample(loc);
    bufferRef.current.push(sample);

    if (bufferRef.current.length >= FLUSH_MAX_SAMPLES) {
      flush(true);
    }
  }, [buildSample, flush, canRecordForeground]);

  // ── start foreground location + accelerometer subscriptions ───────────────
  const startForegroundSubs = useCallback(async () => {
    // Accelerometer at 1 Hz
    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    accelSubRef.current = Accelerometer.addListener((data) => {
      accelRef.current = data;
    });

    // GPS at 1 Hz — skip when the caller feeds location externally to avoid
    // the double-subscription conflict on Android (tracking.tsx already has
    // its own watchPositionAsync open).
    if (!externalGpsRef.current) {
      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy:         Location.Accuracy.BestForNavigation,
            timeInterval:     SAMPLE_INTERVAL_MS,
            distanceInterval: 0,
          },
          (loc) => {
            if (!canRecordForeground()) return;
            const sample = buildSample(loc);
            bufferRef.current.push(sample);
            if (bufferRef.current.length >= FLUSH_MAX_SAMPLES) {
              flush(true);
            }
          }
        );
        locationSubRef.current = sub;
      } catch (err) {
        console.warn("[useTelemetry] location subscription failed", err);
      }
    }

    // Independent 1 Hz sensor timer — guarantees sensor data is always recorded
    // even when GPS is silent (tunnel, lost signal, permission denied). If a GPS
    // fix arrived within the last GPS_SILENCE_MS the GPS path already produced a
    // richer sample, so we skip to avoid duplicates.
    sensorTimerRef.current = setInterval(() => {
      if (!canRecordForeground()) return;
      if (!shouldAddSensorSample(lastGpsTsRef.current)) return;
      bufferRef.current.push(buildSensorSample());
      if (bufferRef.current.length >= FLUSH_MAX_SAMPLES) {
        flush(true);
      }
    }, SAMPLE_INTERVAL_MS);

    // Periodic min-gated flush
    flushTimerRef.current = setInterval(() => {
      flush(false); // respects FLUSH_MIN_SAMPLES
    }, FLUSH_INTERVAL_MS);
  }, [flush, buildSample, buildSensorSample, canRecordForeground]);

  // ── drain samples persisted by a previous failed finishSession flush ──────
  // Runs at session start so no data is permanently stranded.
  // Each key is removed after a successful (or definitively-failed) send attempt.
  const drainUnsentStorage = useCallback(async () => {
    try {
      const keys = [...(await AsyncStorage.getAllKeys())] as string[];
      const unsentKeys = keys.filter((k) => k.startsWith(UNSENT_PREFIX));
      for (const key of unsentKeys) {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) {
          await AsyncStorage.removeItem(key);
          continue;
        }
        let parsed: { sessionId: string; samples: TelemetrySample[] };
        try {
          parsed = JSON.parse(raw) as { sessionId: string; samples: TelemetrySample[] };
        } catch {
          await AsyncStorage.removeItem(key);
          continue;
        }
        if (!parsed.samples || parsed.samples.length === 0) {
          await AsyncStorage.removeItem(key);
          continue;
        }
        try {
          await apiRequest("POST", "/api/telemetry/batch", {
            session_id:   parsed.sessionId,
            session_type: "ride",
            samples:      parsed.samples,
          });
          console.log(
            `[useTelemetry] startSession: drained ${parsed.samples.length} campioni non inviati dalla sessione precedente (${parsed.sessionId}).`
          );
        } catch (e) {
          console.warn(
            `[useTelemetry] startSession: drain di ${parsed.samples.length} campioni fallito — dati persi definitivamente.`,
            e
          );
        }
        await AsyncStorage.removeItem(key);
      }
    } catch (e) {
      // Non-fatal: a drain failure must never block session startup.
      console.warn("[useTelemetry] drainUnsentStorage: errore (non bloccante)", e);
    }
  }, []);

  // ── effect: begin a session (machine "acquiring" entry) ───────────────────
  // Mints the session id, resets GPS fallback state, drains prior unsent
  // samples and persists the session key. Does NOT open foreground subs — the
  // machine calls startForegroundSubs as the next step.
  const beginSession = useCallback(async () => {
    sessionIdRef.current = makeUUID();
    bufferRef.current    = [];
    // Reset GPS fallback state so a new session never reuses the previous
    // session's last fix — sensor-only samples must be null until a fresh fix.
    lastKnownLocRef.current = null;
    lastGpsTsRef.current    = 0;

    // Drain any samples persisted from a previous failed finishSession flush.
    // Fire before foreground subs start so auth is more likely valid.
    await drainUnsentStorage();

    // Persist session ID so the background task can tag its samples.
    await AsyncStorage.setItem(BG_TELEMETRY_SESSION_KEY, sessionIdRef.current);
  }, [drainUnsentStorage]);

  // ── effect: finish a session (machine "stopping" → "idle") ────────────────
  // Force-flushes the foreground buffer with one retry, persists anything still
  // unsent to AsyncStorage, then clears the session key + in-memory state. The
  // background task is stopped/drained by the machine BEFORE this runs. Never
  // drops samples silently.
  const finishSession = useCallback(async () => {
    // Clear the background session key so a late background-task tick can't tag
    // samples to a session that is ending.
    await AsyncStorage.removeItem(BG_TELEMETRY_SESSION_KEY);

    // First flush attempt
    await flush(true);

    // If flush failed, samples were re-queued by flush().
    // Wait briefly and retry once — covers transient network/auth hiccups.
    if (bufferRef.current.length > 0) {
      console.warn(
        `[useTelemetry] stop: primo flush fallito (${bufferRef.current.length} campioni). Retry tra ${STOP_RETRY_DELAY_MS}ms...`
      );
      await new Promise<void>((r) => setTimeout(r, STOP_RETRY_DELAY_MS));
      await flush(true);
    }

    // If samples are still queued after retry, persist to AsyncStorage so they
    // can be sent at the start of the next session. Never silently drop data.
    if (bufferRef.current.length > 0) {
      const sessionId = sessionIdRef.current;
      const stranded  = [...bufferRef.current];
      if (sessionId) {
        await persistUnsentSamples(sessionId, stranded);
      } else {
        console.warn(
          `[useTelemetry] stop: ${stranded.length} campioni persi — sessionId già null, impossibile persistere.`
        );
      }
    }

    sessionIdRef.current = null;
    bufferRef.current = [];
  }, [flush, persistUnsentSamples]);

  // ── lazily build the collector machine (once) with the real effects ───────
  const getMachine = useCallback((): TelemetryCollectorMachine => {
    if (!machineRef.current) {
      machineRef.current = createTelemetryCollector({
        beginSession,
        startForeground: startForegroundSubs,
        stopForeground:  teardown,
        flush,
        startBackground: startTelemetryBackgroundTask,
        stopBackground:  stopTelemetryBackgroundTask,
        drainBackground: drainAndFlushBackgroundBuffer,
        finishSession,
      });
    }
    return machineRef.current;
  }, [
    beginSession,
    startForegroundSubs,
    teardown,
    flush,
    drainAndFlushBackgroundBuffer,
    finishSession,
  ]);

  // ── react to isActive changes ──────────────────────────────────────────────
  // IMPORTANT: no cleanup return here. The machine's stop() owns teardown +
  // force-flush + persist; returning a cleanup would race it. The unmount-only
  // effect below handles component teardown independently.
  useEffect(() => {
    const machine = getMachine();
    if (isActive) {
      machine.start();
    } else {
      machine.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── unmount-only cleanup (no isActive dependency) ─────────────────────────
  // Runs exactly once when the host component unmounts. Best-effort stop so
  // subscriptions and the background task are cleaned up (fire-and-forget — the
  // machine is idempotent and no-ops when already idle).
  useEffect(() => {
    return () => {
      machineRef.current?.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — unmount only

  // ── serialized AppState handler → drives the collector machine ────────────
  // This is the ONLY AppState listener the collector adds; it merely steers the
  // state machine and defers session/heartbeat/online concerns to the
  // centralized AppStateHandler (Task #4585). Only "background" triggers the
  // background-task handoff: "inactive" is a transient iOS state (phone call,
  // control-centre swipe) and must not start the battery-heavy background task.
  // The machine's transitions are guarded by state, so a spurious event is a
  // no-op rather than a double handoff.
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      // The dispatch is wrapped so this native callback can never throw on
      // resume (the React ErrorBoundary does not cover AppState rejections).
      try {
        if (nextState === "background") {
          machineRef.current?.toBackground();
        } else if (nextState === "active") {
          machineRef.current?.toForeground();
        }
        // "inactive" intentionally not handled.
      } catch {
        // no-op: never let the telemetry AppState callback crash the app
      }
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, []);

  return { sessionId: sessionIdRef.current, pushLocation };
}
