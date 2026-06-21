import { useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { Accelerometer, DeviceMotion } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { queryClient } from "@/lib/query-client";
import {
  BG_TELEMETRY_SESSION_KEY,
  startTelemetryBackgroundTask,
  stopTelemetryBackgroundTask,
} from "@/lib/background-telemetry-task";
import {
  createTelemetryCollector,
  type TelemetryCollectorMachine,
} from "@/lib/telemetry-collector-machine";
import {
  TRACKING_FUSION,
  shouldRecordSensorSample,
  evaluateSegment,
  deadReckonStep,
  type TelemetrySample,
} from "@shared/tracking-fusion";
import {
  useTelemetryUpload,
  FLUSH_MAX_SAMPLES,
  UPLOAD_EVERY_KM,
  STOP_RETRY_DELAY_MS,
  CHECKPOINT_INTERVAL_MS,
} from "@/hooks/useTelemetryUpload";

// ─── Constants ────────────────────────────────────────────────────────────────
const SAMPLE_INTERVAL_MS = 1000;
export const GPS_SILENCE_MS = TRACKING_FUSION.GPS_SILENCE_MS;

export function shouldAddSensorSample(lastGpsTsMs: number, nowMs: number = Date.now()): boolean {
  return shouldRecordSensorSample(lastGpsTsMs, nowMs);
}

const SPEED_EMA_ALPHA = 0.3;
const DR_SPEED_DECAY  = 0.98;

// ─── Types ────────────────────────────────────────────────────────────────────
export type { TelemetrySample };

interface AccelReading { x: number; y: number; z: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
export function useTelemetry(isActive: boolean, externalGps = false) {
  const sessionIdRef    = useRef<string | null>(null);
  const bufferRef       = useRef<TelemetrySample[]>([]);
  const accelRef        = useRef<AccelReading>({ x: 0, y: 0, z: 1 });
  const locationSubRef      = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef         = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const sensorTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkpointTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastKnownLocRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastGpsTsRef    = useRef<number>(0);

  // ── Offline-first local processing state (Task #4705) ──────────────────────
  const totalKmRef        = useRef<number>(0);
  const kmAtLastUploadRef = useRef<number>(0);
  const lastDistPosRef    = useRef<{ lat: number; lon: number; ts: number } | null>(null);
  const emaSpeedRef       = useRef<number>(0);
  const headingRef        = useRef<number | null>(null);
  const motionSubRef      = useRef<ReturnType<typeof DeviceMotion.addListener> | null>(null);
  const machineRef        = useRef<TelemetryCollectorMachine | null>(null);
  const externalGpsRef    = useRef(externalGps);
  useEffect(() => { externalGpsRef.current = externalGps; }, [externalGps]);

  // ── Upload sub-hook ─────────────────────────────────────────────────────────
  const {
    flush,
    maybeUploadByDistance,
    drainAndFlushBackgroundBuffer,
    persistUnsentSamples,
    checkpointBuffer,
    clearCrashRecovery,
    drainUnsentStorage,
  } = useTelemetryUpload(sessionIdRef, bufferRef, totalKmRef, kmAtLastUploadRef);

  const canRecordForeground = useCallback((): boolean => {
    const s = machineRef.current?.getState();
    return s === "foreground" || s === "acquiring";
  }, []);

  // ── internal teardown ───────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    if (sensorTimerRef.current)     { clearInterval(sensorTimerRef.current); sensorTimerRef.current = null; }
    if (checkpointTimerRef.current) { clearInterval(checkpointTimerRef.current); checkpointTimerRef.current = null; }
    if (locationSubRef.current)     { locationSubRef.current.remove(); locationSubRef.current = null; }
    if (accelSubRef.current)        { accelSubRef.current.remove(); accelSubRef.current = null; }
    if (motionSubRef.current)       { motionSubRef.current.remove(); motionSubRef.current = null; }
  }, []);

  // ── build a sample from a GPS fix + current accelerometer ──────────────────
  const buildSample = useCallback((loc: Location.LocationObject): TelemetrySample => {
    const { latitude, longitude, altitude, speed, heading, accuracy } = loc.coords;
    const accel = accelRef.current;

    const prev = lastDistPosRef.current;
    if (prev) {
      const seg = evaluateSegment({
        prevLat: prev.lat, prevLng: prev.lon, prevTimeMs: prev.ts,
        lat: latitude, lng: longitude, timeMs: loc.timestamp,
        accuracyM: accuracy ?? null,
      });
      if (seg.accept) {
        totalKmRef.current += seg.distanceKm;
        lastDistPosRef.current = { lat: latitude, lon: longitude, ts: loc.timestamp };
      }
    } else {
      lastDistPosRef.current = { lat: latitude, lon: longitude, ts: loc.timestamp };
    }

    lastKnownLocRef.current = { lat: latitude, lon: longitude };
    lastGpsTsRef.current    = Date.now();

    const sample: TelemetrySample = { ts: loc.timestamp, lat: latitude, lon: longitude };

    if (speed != null && speed >= 0) {
      const kmh = speed * 3.6;
      sample.speed_kmh = kmh;
      emaSpeedRef.current = emaSpeedRef.current === 0
        ? kmh
        : SPEED_EMA_ALPHA * kmh + (1 - SPEED_EMA_ALPHA) * emaSpeedRef.current;
    }
    if (altitude != null)           sample.altitude_m  = altitude;
    if (heading != null && heading >= 0) {
      sample.heading     = heading;
      headingRef.current = heading;
    }
    sample.gforce_x   = accel.x;
    sample.gforce_y   = accel.y;
    sample.gforce_z   = accel.z;
    sample.lean_angle = calcLeanAngle(accel.x, accel.z);
    return sample;
  }, []);

  // ── build a sensor-only sample with dead-reckoning ─────────────────────────
  const buildSensorSample = useCallback((): TelemetrySample => {
    const accel   = accelRef.current;
    const last    = lastKnownLocRef.current;
    emaSpeedRef.current *= DR_SPEED_DECAY;

    let lat: number | null = last ? last.lat : null;
    let lon: number | null = last ? last.lon : null;
    let estimated = false;

    const heading = headingRef.current;
    if (last && typeof heading === "number") {
      const dr = deadReckonStep(last, heading, emaSpeedRef.current, SAMPLE_INTERVAL_MS);
      if (dr) {
        lat = dr.lat; lon = dr.lon;
        lastKnownLocRef.current = { lat: dr.lat, lon: dr.lon };
        totalKmRef.current += dr.stepKm;
        estimated = true;
      }
    }

    const sample: TelemetrySample = {
      ts: Date.now(), lat, lon,
      gforce_x: accel.x, gforce_y: accel.y, gforce_z: accel.z,
      lean_angle: calcLeanAngle(accel.x, accel.z),
    };
    if (emaSpeedRef.current > 0)     sample.speed_kmh = emaSpeedRef.current;
    if (typeof heading === "number") sample.heading    = heading;
    if (estimated)                   sample.estimated  = true;
    return sample;
  }, []);

  // ── push location from external GPS source ─────────────────────────────────
  const pushLocation = useCallback((loc: Location.LocationObject) => {
    if (!canRecordForeground()) return;
    const sample = buildSample(loc);
    bufferRef.current.push(sample);
    if (bufferRef.current.length >= FLUSH_MAX_SAMPLES) flush(true);
    else maybeUploadByDistance();
  }, [buildSample, flush, maybeUploadByDistance, canRecordForeground]);

  // ── start foreground subscriptions ─────────────────────────────────────────
  const startForegroundSubs = useCallback(async () => {
    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    accelSubRef.current = Accelerometer.addListener((data) => { accelRef.current = data; });

    if (!externalGpsRef.current) {
      try {
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: SAMPLE_INTERVAL_MS, distanceInterval: 0 },
          (loc) => {
            if (!canRecordForeground()) return;
            const sample = buildSample(loc);
            bufferRef.current.push(sample);
            if (bufferRef.current.length >= FLUSH_MAX_SAMPLES) flush(true);
            else maybeUploadByDistance();
          }
        );
        locationSubRef.current = sub;
      } catch (err) {
        console.warn("[useTelemetry] location subscription failed", err);
      }
    }

    try {
      if (await DeviceMotion.isAvailableAsync()) {
        DeviceMotion.setUpdateInterval(SAMPLE_INTERVAL_MS);
        motionSubRef.current = DeviceMotion.addListener((data) => {
          try {
            const alpha = (data?.rotation as { alpha?: number } | undefined)?.alpha;
            if (typeof alpha === "number" && Number.isFinite(alpha)) {
              headingRef.current = (((alpha * 180) / Math.PI) % 360 + 360) % 360;
            }
          } catch { /* never crash the listener */ }
        });
      }
    } catch (err) {
      console.warn("[useTelemetry] DeviceMotion subscription failed", err);
    }

    sensorTimerRef.current = setInterval(() => {
      if (!canRecordForeground()) return;
      if (!shouldAddSensorSample(lastGpsTsRef.current)) return;
      bufferRef.current.push(buildSensorSample());
      if (bufferRef.current.length >= FLUSH_MAX_SAMPLES) flush(true);
      else maybeUploadByDistance();
    }, SAMPLE_INTERVAL_MS);

    checkpointTimerRef.current = setInterval(() => {
      checkpointBuffer().catch(() => {});
    }, CHECKPOINT_INTERVAL_MS);
  }, [flush, buildSample, buildSensorSample, maybeUploadByDistance, canRecordForeground, checkpointBuffer]);

  // ── begin session ───────────────────────────────────────────────────────────
  const beginSession = useCallback(async () => {
    sessionIdRef.current = makeUUID();
    bufferRef.current    = [];
    lastKnownLocRef.current = null;
    lastGpsTsRef.current    = 0;
    totalKmRef.current        = 0;
    kmAtLastUploadRef.current = 0;
    lastDistPosRef.current    = null;
    emaSpeedRef.current       = 0;
    headingRef.current        = null;
    await drainUnsentStorage();
    await AsyncStorage.setItem(BG_TELEMETRY_SESSION_KEY, sessionIdRef.current);
  }, [drainUnsentStorage]);

  // ── finish session ──────────────────────────────────────────────────────────
  const finishSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    await AsyncStorage.removeItem(BG_TELEMETRY_SESSION_KEY);
    await flush(true);
    if (bufferRef.current.length > 0) {
      console.warn(`[useTelemetry] stop: primo flush fallito (${bufferRef.current.length} campioni). Retry tra ${STOP_RETRY_DELAY_MS}ms...`);
      await new Promise<void>((r) => setTimeout(r, STOP_RETRY_DELAY_MS));
      await flush(true);
    }
    if (bufferRef.current.length > 0) {
      const stranded  = [...bufferRef.current];
      if (sessionId) {
        await persistUnsentSamples(sessionId, stranded);
        // Remove the crash-recovery key so only the UNSENT key survives.
        // Both keys contain the same unsent samples; keeping both would cause
        // drainUnsentStorage to POST duplicates on the next session start.
        await clearCrashRecovery(sessionId);
      } else {
        console.warn(`[useTelemetry] stop: ${stranded.length} campioni persi — sessionId già null.`);
      }
    } else if (sessionId) {
      await clearCrashRecovery(sessionId);
    }
    sessionIdRef.current = null;
    bufferRef.current    = [];
  }, [flush, persistUnsentSamples, clearCrashRecovery]);

  // ── lazily build the collector machine ─────────────────────────────────────
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
  }, [beginSession, startForegroundSubs, teardown, flush, drainAndFlushBackgroundBuffer, finishSession]);

  // ── react to isActive ───────────────────────────────────────────────────────
  useEffect(() => {
    const machine = getMachine();
    if (isActive) machine.start();
    else          machine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── unmount cleanup ─────────────────────────────────────────────────────────
  useEffect(() => {
    return () => { machineRef.current?.stop().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── AppState → machine ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      try {
        if (nextState === "background") machineRef.current?.toBackground();
        else if (nextState === "active") machineRef.current?.toForeground();
      } catch { /* no-op */ }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, []);

  // Invalidate telemetry stats on queryClient (needed after bg drain)
  void queryClient;

  return { sessionId: sessionIdRef.current, pushLocation };
}
