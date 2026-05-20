import { useEffect, useRef, useCallback } from "react";
import { Platform, AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import { apiRequest } from "@/lib/query-client";

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
 *  - App backgrounding → same as explicit stop (full teardown + force flush)
 *  - Component unmount → same as explicit stop
 */
export function useTelemetry(isActive: boolean) {
  const sessionIdRef   = useRef<string | null>(null);
  const bufferRef      = useRef<TelemetrySample[]>([]);
  const accelRef       = useRef<AccelReading>({ x: 0, y: 0, z: 1 });
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef    = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const flushTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFlushing     = useRef(false);
  const activeRef      = useRef(false); // mirrors isActive without re-render closure issues

  // ── flush buffer to server ─────────────────────────────────────────────────
  // force=true → send even when below FLUSH_MIN_SAMPLES (used for stop/background)
  // force=false → respect FLUSH_MIN_SAMPLES gate (used for periodic timer)
  const flush = useCallback(async (force: boolean) => {
    if (isFlushing.current) return;
    const buf = bufferRef.current;
    if (buf.length === 0) return;
    if (!force && buf.length < FLUSH_MIN_SAMPLES) return;

    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    const toSend = buf.splice(0, FLUSH_MAX_SAMPLES);
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

  // ── internal teardown (subscriptions + timer) ─────────────────────────────
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
    activeRef.current = false;

    teardown();
    await flush(true); // force-flush remaining buffer
    sessionIdRef.current = null;
    bufferRef.current = [];
  }, [flush, teardown]);

  // ── start collection ───────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    activeRef.current   = true;
    sessionIdRef.current = makeUUID();
    bufferRef.current   = [];

    // Accelerometer at 1 Hz (native only)
    if (Platform.OS !== "web") {
      Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
      accelSubRef.current = Accelerometer.addListener((data) => {
        accelRef.current = data;
      });
    }

    // GPS at 1 Hz — independent subscription so this hook is self-contained
    try {
      const sub = await Location.watchPositionAsync(
        {
          accuracy:         Location.Accuracy.BestForNavigation,
          timeInterval:     SAMPLE_INTERVAL_MS,
          distanceInterval: 0,
        },
        (loc) => {
          if (!activeRef.current) return; // guard against late callbacks after stop

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
          if (Platform.OS !== "web") {
            sample.gforce_x   = accel.x;
            sample.gforce_y   = accel.y;
            sample.gforce_z   = accel.z;
            sample.lean_angle = calcLeanAngle(accel.x, accel.z);
          }

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

  // ── react to isActive changes ──────────────────────────────────────────────
  useEffect(() => {
    if (isActive) {
      startSession();
    } else {
      stopSession();
    }

    return () => {
      // On unmount: do a full stop regardless of current isActive
      activeRef.current = false;
      teardown();
      // Best-effort final flush on unmount (fire-and-forget, not awaited)
      if (sessionIdRef.current && bufferRef.current.length > 0) {
        flush(true).catch(() => {});
      }
      sessionIdRef.current = null;
      bufferRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── full session stop on app backgrounding ─────────────────────────────────
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        if (activeRef.current) {
          stopSession();
        }
      }
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [stopSession]);

  return { sessionId: sessionIdRef.current };
}
