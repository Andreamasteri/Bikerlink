import { useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";
import {
  BG_TELEMETRY_SESSION_KEY,
  startTelemetryBackgroundTask,
  stopTelemetryBackgroundTask,
  drainBackgroundTelemetryBuffer,
} from "@/lib/background-telemetry-task";

// ─── Constants ────────────────────────────────────────────────────────────────
const SAMPLE_INTERVAL_MS = 1000;   // 1 Hz
const FLUSH_INTERVAL_MS  = 90_000; // periodic flush every 90 s (min-gated)
const FLUSH_MIN_SAMPLES  = 50;     // min samples before a periodic flush fires
const FLUSH_MAX_SAMPLES  = 200;    // hard cap — flush immediately at this count

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
 * Session lifecycle:
 *  - isActive true  → new session starts (new UUID, fresh buffer)
 *  - isActive false → session ends: subs stopped, remaining buffer force-flushed
 *  - App backgrounding → foreground subs paused; background task (TASK_TELEMETRY)
 *                        continues writing samples to AsyncStorage
 *  - App foregrounding → background task stopped; buffered samples drained and
 *                        flushed to the server; foreground subs restarted
 *  - Component unmount → same as explicit stop
 */
export function useTelemetry(isActive: boolean) {
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
    } catch (err) {
      // Re-queue on network failure to avoid data loss
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

    await flush(true); // force-flush remaining foreground buffer
    sessionIdRef.current = null;
    bufferRef.current = [];
  }, [flush, teardown, drainAndFlushBackgroundBuffer]);

  // ── start foreground location + accelerometer subscriptions ───────────────
  const startForegroundSubs = useCallback(async () => {
    // Accelerometer at 1 Hz
    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    accelSubRef.current = Accelerometer.addListener((data) => {
      accelRef.current = data;
    });

    // GPS at 1 Hz
    try {
      const sub = await Location.watchPositionAsync(
        {
          accuracy:         Location.Accuracy.BestForNavigation,
          timeInterval:     SAMPLE_INTERVAL_MS,
          distanceInterval: 0,
        },
        (loc) => {
          if (!activeRef.current || inBackgroundRef.current) return;

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

          bufferRef.current.push(sample);

          // Immediate force-flush if hard cap hit
          if (bufferRef.current.length >= FLUSH_MAX_SAMPLES) {
            flush(true);
          }
        }
      );
      locationSubRef.current = sub;
    } catch (err) {
      console.warn("[useTelemetry] location subscription failed", err);
    }

    // Periodic min-gated flush
    flushTimerRef.current = setInterval(() => {
      flush(false); // respects FLUSH_MIN_SAMPLES
    }, FLUSH_INTERVAL_MS);
  }, [flush]);

  // ── start collection ───────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    activeRef.current    = true;
    inBackgroundRef.current = false;
    sessionIdRef.current = makeUUID();
    bufferRef.current    = [];

    // Persist session ID so the background task can tag its samples
    await AsyncStorage.setItem(BG_TELEMETRY_SESSION_KEY, sessionIdRef.current);

    await startForegroundSubs();
  }, [startForegroundSubs]);

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
  useEffect(() => {
    if (isActive) {
      startSession();
    } else {
      stopSession();
    }

    return () => {
      // On unmount: full stop regardless of current isActive
      activeRef.current    = false;
      inBackgroundRef.current = false;
      teardown();
      // Best-effort final flush on unmount (fire-and-forget, not awaited)
      if (sessionIdRef.current && bufferRef.current.length > 0) {
        flush(true).catch(() => {});
      }
      stopTelemetryBackgroundTask().catch(() => {});
      AsyncStorage.removeItem(BG_TELEMETRY_SESSION_KEY).catch(() => {});
      sessionIdRef.current = null;
      bufferRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

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

  return { sessionId: sessionIdRef.current };
}
