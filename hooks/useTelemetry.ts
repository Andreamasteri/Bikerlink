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

// ─── Constants ────────────────────────────────────────────────────────────────
const SAMPLE_INTERVAL_MS  = 1000;   // 1 Hz
const FLUSH_INTERVAL_MS   = 30_000; // periodic flush every 30 s (was 90 s)
const FLUSH_MIN_SAMPLES   = 5;      // min samples before a periodic flush fires (was 50)
const FLUSH_MAX_SAMPLES   = 200;    // hard cap — flush immediately at this count
const STOP_RETRY_DELAY_MS = 1_500;  // pause before retry flush on stopSession failure
// AsyncStorage key prefix for samples persisted across sessions on flush failure.
const UNSENT_PREFIX = "@bikerlink/telemetry_unsent_";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TelemetrySample {
  ts:          number;
  lat:         number;
  lon:         number;
  speed_kmh?:  number;
  lean_angle?: number;
  gforce_x?:   number;
  gforce_y?:   number;
  gforce_z?:   number;
  heading?:    number;
  altitude_m?: number;
}

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
 * Session lifecycle:
 *  - isActive true  → new session starts (new UUID, fresh buffer)
 *  - isActive false → session ends: subs stopped, remaining buffer force-flushed
 *  - App backgrounding → foreground subs paused; background task (TASK_TELEMETRY)
 *                        continues writing samples to AsyncStorage
 *  - App foregrounding → background task stopped; buffered samples drained and
 *                        flushed to the server; foreground subs restarted
 *  - Component unmount → same as explicit stop
 */
export function useTelemetry(isActive: boolean, externalGps = false) {
  const sessionIdRef   = useRef<string | null>(null);
  const bufferRef      = useRef<TelemetrySample[]>([]);
  const accelRef       = useRef<AccelReading>({ x: 0, y: 0, z: 1 });
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef    = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const flushTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFlushing      = useRef(false);
  const activeRef       = useRef(false); // mirrors isActive without re-render closure issues
  const inBackgroundRef = useRef(false); // true while background task is handling collection
  // Serializes async AppState transitions so handoff/resume can never overlap.
  const transitionRef   = useRef<Promise<void>>(Promise.resolve());
  // Stable ref to externalGps flag so callbacks don't capture a stale closure.
  const externalGpsRef  = useRef(externalGps);
  useEffect(() => { externalGpsRef.current = externalGps; }, [externalGps]);

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

    // Send in FLUSH_MAX_SAMPLES chunks
    let offset = 0;
    while (offset < bgSamples.length) {
      const chunk = bgSamples.slice(offset, offset + FLUSH_MAX_SAMPLES);
      offset += FLUSH_MAX_SAMPLES;
      try {
        await apiRequest("POST", "/api/telemetry/batch", {
          session_id:   sessionId,
          session_type: "ride",
          samples:      chunk,
        });
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
  // Called when stopSession flush fails (auth / network). Samples are stored
  // under a session-keyed entry and drained at the start of the next session.
  const persistUnsentSamples = useCallback(async (
    sessionId: string,
    samples: TelemetrySample[]
  ) => {
    const key = `${UNSENT_PREFIX}${sessionId}`;
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ sessionId, samples }));
      console.warn(
        `[useTelemetry] stopSession: ${samples.length} campioni persistiti in AsyncStorage (${key}) — saranno inviati alla prossima sessione.`
      );
    } catch (e) {
      console.warn(
        `[useTelemetry] stopSession: ${samples.length} campioni NON inviati — persist AsyncStorage fallito. Dati persi.`,
        e
      );
    }
  }, []);

  // ── full session stop: teardown + force flush + clear session ─────────────
  const stopSession = useCallback(async () => {
    if (!activeRef.current) return;
    activeRef.current    = false;
    inBackgroundRef.current = false;

    teardown();

    // Stop background task if it was running
    await stopTelemetryBackgroundTask();
    // Drain any remaining background samples before clearing the session
    await drainAndFlushBackgroundBuffer();
    await AsyncStorage.removeItem(BG_TELEMETRY_SESSION_KEY);

    // First flush attempt
    await flush(true);

    // If flush failed, samples were re-queued by flush().
    // Wait briefly and retry once — covers transient network/auth hiccups.
    if (bufferRef.current.length > 0) {
      console.warn(
        `[useTelemetry] stopSession: primo flush fallito (${bufferRef.current.length} campioni). Retry tra ${STOP_RETRY_DELAY_MS}ms...`
      );
      await new Promise<void>((r) => setTimeout(r, STOP_RETRY_DELAY_MS));
      await flush(true);
    }

    // If samples are still queued after retry, persist to AsyncStorage so
    // they can be sent at the start of the next active session.
    // Never silently drop data — we must not clear the buffer without at
    // least attempting to save it somewhere durable.
    if (bufferRef.current.length > 0) {
      const sessionId = sessionIdRef.current;
      const stranded  = [...bufferRef.current];
      if (sessionId) {
        await persistUnsentSamples(sessionId, stranded);
      } else {
        console.warn(
          `[useTelemetry] stopSession: ${stranded.length} campioni persi — sessionId già null, impossibile persistere.`
        );
      }
    }

    sessionIdRef.current = null;
    bufferRef.current = [];
  }, [flush, teardown, drainAndFlushBackgroundBuffer, persistUnsentSamples]);

  // ── build a sample from a Location.LocationObject + current accelerometer ──
  const buildSample = useCallback((loc: Location.LocationObject): TelemetrySample => {
    const { latitude, longitude, altitude, speed, heading } = loc.coords;
    const accel = accelRef.current;

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

  // ── accept an externally-provided location update ─────────────────────────
  // Called by the parent (tracking.tsx) when externalGps=true so we never
  // open a second watchPositionAsync alongside the one the screen already has.
  const pushLocation = useCallback((loc: Location.LocationObject) => {
    if (!activeRef.current || inBackgroundRef.current) return;

    const sample = buildSample(loc);
    bufferRef.current.push(sample);

    if (bufferRef.current.length >= FLUSH_MAX_SAMPLES) {
      flush(true);
    }
  }, [buildSample, flush]);

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
            if (!activeRef.current || inBackgroundRef.current) return;
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

    // Periodic min-gated flush
    flushTimerRef.current = setInterval(() => {
      flush(false); // respects FLUSH_MIN_SAMPLES
    }, FLUSH_INTERVAL_MS);
  }, [flush, buildSample]);

  // ── drain samples persisted by a previous failed stopSession flush ────────
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

  // ── start collection ───────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    activeRef.current    = true;
    inBackgroundRef.current = false;
    sessionIdRef.current = makeUUID();
    bufferRef.current    = [];

    // Drain any samples persisted from a previous failed stopSession flush.
    // Fire before startForegroundSubs so auth is more likely valid.
    await drainUnsentStorage();

    // Persist session ID so the background task can tag its samples
    await AsyncStorage.setItem(BG_TELEMETRY_SESSION_KEY, sessionIdRef.current);

    await startForegroundSubs();
  }, [startForegroundSubs, drainUnsentStorage]);

  // ── enqueue a serialized AppState transition ──────────────────────────────
  // All async handoff/resume work is chained onto transitionRef so that a
  // rapid inactive→active flip cannot cause the background task to start
  // after the foreground has already resumed.
  const enqueueTransition = useCallback((fn: () => Promise<void>) => {
    transitionRef.current = transitionRef.current.then(fn).catch(() => {});
  }, []);

  // ── hand off to background task when app enters background ───────────────
  // NOTE: only triggered on "background", NOT "inactive".  "inactive" is a
  // transient iOS state (phone call, control-centre swipe, etc.) and does
  // not warrant starting the battery-heavy background location task.
  const handoffToBackground = useCallback(() => {
    enqueueTransition(async () => {
      // Re-check inside the serialized chain — state may have changed while
      // a previous transition was awaiting.
      if (!activeRef.current || inBackgroundRef.current) return;
      inBackgroundRef.current = true;

      // Stop foreground subscriptions; background task takes over GPS.
      teardown();

      // Flush whatever is in the foreground buffer before switching.
      await flush(true);

      const started = await startTelemetryBackgroundTask();
      if (!started) {
        // Background permission not granted — fall back to a full stop.
        inBackgroundRef.current = false;
        activeRef.current = false;
        await AsyncStorage.removeItem(BG_TELEMETRY_SESSION_KEY);
        sessionIdRef.current = null;
        bufferRef.current = [];
      }
    });
  }, [enqueueTransition, flush, teardown]);

  // ── resume foreground collection when app comes back to active ────────────
  const resumeFromBackground = useCallback(() => {
    enqueueTransition(async () => {
      if (!activeRef.current || !inBackgroundRef.current) return;
      inBackgroundRef.current = false;

      // Stop the background task before restarting foreground subs.
      // This must complete before we call startForegroundSubs so there is
      // no window where both are running simultaneously.
      await stopTelemetryBackgroundTask();
      // Drain and flush background samples before restarting foreground.
      await drainAndFlushBackgroundBuffer();

      await startForegroundSubs();
    });
  }, [enqueueTransition, startForegroundSubs, drainAndFlushBackgroundBuffer]);

  // ── react to isActive changes ──────────────────────────────────────────────
  // IMPORTANT: no cleanup return here. If we returned a cleanup it would run
  // *before* stopSession() on every isActive transition, setting activeRef=false
  // and clearing the buffer first — causing stopSession() to immediately no-op
  // and silently lose data. The unmount-only effect below handles component
  // teardown independently.
  useEffect(() => {
    if (isActive) {
      startSession();
    } else {
      stopSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── unmount-only cleanup (no isActive dependency) ─────────────────────────
  // Runs exactly once when the component that hosts this hook unmounts. If the
  // session is still active at that point (i.e. stopSession was never awaited),
  // do a best-effort fire-and-forget stop so subscriptions and background tasks
  // are cleaned up. This is separate from the isActive effect so the cleanup
  // cannot pre-empt stopSession's retry/persist logic during normal stops.
  useEffect(() => {
    return () => {
      if (!activeRef.current && !sessionIdRef.current) return; // already stopped
      activeRef.current    = false;
      inBackgroundRef.current = false;
      teardown();
      // Best-effort final flush on unmount (fire-and-forget, not awaited).
      // We cannot await here (cleanup functions are sync), so this may not
      // complete the retry/persist path — accepted trade-off for unmount edge case.
      if (sessionIdRef.current && bufferRef.current.length > 0) {
        flush(true).catch(() => {});
      }
      stopTelemetryBackgroundTask().catch(() => {});
      AsyncStorage.removeItem(BG_TELEMETRY_SESSION_KEY).catch(() => {});
      sessionIdRef.current = null;
      bufferRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — unmount only, refs are always current

  // ── serialized AppState handler ────────────────────────────────────────────
  // Only "background" triggers the background task handoff.
  // "inactive" is a transient iOS state and is deliberately ignored here to
  // prevent spurious background task churn on brief interruptions.
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "background") {
        if (activeRef.current && !inBackgroundRef.current) {
          handoffToBackground();
        }
      } else if (nextState === "active") {
        if (activeRef.current && inBackgroundRef.current) {
          resumeFromBackground();
        }
      }
      // "inactive" intentionally not handled.
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [handoffToBackground, resumeFromBackground]);

  return { sessionId: sessionIdRef.current, pushLocation };
}
