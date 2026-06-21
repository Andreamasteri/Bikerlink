import { useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { Accelerometer, DeviceMotion } from "expo-sensors";
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
  evaluateSegment,
  computeDestinationPoint,
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
const FLUSH_MAX_SAMPLES   = 200;    // hard cap — flush immediately at this count
// Offline-first upload cadence (Task #4705): instead of a wall-clock timer, the
// foreground buffer is uploaded in the background only every UPLOAD_EVERY_KM of
// travelled distance. Uploads are fire-and-forget so they never block sampling;
// a force flush still happens on stop/background/buffer-cap.
const UPLOAD_EVERY_KM     = 5;
// EMA smoothing factor for the locally-derived speed estimate (0..1, higher =
// snappier). Mirrors the gentle smoothing used by the live tracking fusion.
const SPEED_EMA_ALPHA     = 0.3;
// Per-tick decay applied to the EMA speed while dead-reckoning with no fresh GPS
// fix, so a stale speed bleeds toward zero instead of running forever.
const DR_SPEED_DECAY      = 0.98;
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
  // Independent 1 Hz timer that records sensor-only samples when GPS is silent.
  const sensorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Last known GPS fix coords — reused when no fresh fix is available.
  const lastKnownLocRef = useRef<{ lat: number; lon: number } | null>(null);
  // Timestamp (ms) of the most recent GPS fix, used to detect GPS silence.
  const lastGpsTsRef    = useRef<number>(0);
  const isFlushing      = useRef(false);

  // ── Offline-first local processing state (Task #4705) ──────────────────────
  // Running total distance (km) accumulated locally from accepted GPS segments
  // plus dead-reckoned sensor-only movement. Drives the distance-based upload.
  const totalKmRef        = useRef<number>(0);
  // Distance marker (km) at the last successful upload — a new upload fires once
  // totalKm - kmAtLastUpload >= UPLOAD_EVERY_KM, and only advances on success.
  const kmAtLastUploadRef = useRef<number>(0);
  // Previous accepted position + timestamp for incremental distance via
  // evaluateSegment (same gate the live tracking system uses).
  const lastDistPosRef    = useRef<{ lat: number; lon: number; ts: number } | null>(null);
  // Locally-smoothed speed estimate (km/h) — EMA of GPS speed, decayed while
  // dead-reckoning. Used to advance the DR position when GPS is silent.
  const emaSpeedRef       = useRef<number>(0);
  // Compass heading (deg, 0 = north) from DeviceMotion.rotation.alpha — the
  // travel direction used to dead-reckon position during GPS silence.
  const headingRef        = useRef<number | null>(null);
  // DeviceMotion subscription (heading source) — independent of the Accelerometer
  // sub so the existing g-force/lean sampling is unchanged.
  const motionSubRef      = useRef<ReturnType<typeof DeviceMotion.addListener> | null>(null);
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
  // Returns true when a batch was actually sent and acknowledged, false otherwise
  // (already flushing, empty buffer, no session, or the POST failed). The boolean
  // lets the distance-based uploader advance its marker ONLY on a real success.
  // The `force` arg is retained for call-site clarity; with the periodic gate
  // removed every flush now sends whatever is buffered.
  const flush = useCallback(async (_force: boolean): Promise<boolean> => {
    if (isFlushing.current) return false;
    const buf = bufferRef.current;
    if (buf.length === 0) return false;

    const sessionId = sessionIdRef.current;
    if (!sessionId) return false;

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
      return true;
    } catch (err) {
      // Re-queue on network/auth failure to avoid data loss
      bufferRef.current = [...toSend, ...bufferRef.current];
      console.warn("[useTelemetry] flush failed, re-queued", err);
      return false;
    } finally {
      isFlushing.current = false;
    }
  }, []);

  // ── distance-based background upload (Task #4705) ─────────────────────────
  // Fire-and-forget: when at least UPLOAD_EVERY_KM has been travelled since the
  // last successful upload, kick a background flush. Non-blocking so sampling is
  // never stalled; the distance marker only advances when the flush succeeds, so
  // a failed upload is retried at the next sample rather than silently skipped.
  const maybeUploadByDistance = useCallback(() => {
    if (totalKmRef.current - kmAtLastUploadRef.current < UPLOAD_EVERY_KM) return;
    const markAt = totalKmRef.current;
    void flush(true).then((sent) => {
      if (sent) kmAtLastUploadRef.current = markAt;
    });
  }, [flush]);

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
    if (motionSubRef.current) {
      motionSubRef.current.remove();
      motionSubRef.current = null;
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
    const { latitude, longitude, altitude, speed, heading, accuracy } = loc.coords;
    const accel = accelRef.current;
    const nowMs = Date.now();

    // Local distance accumulation (Task #4705): gate each segment with the same
    // accuracy/floor/speed-jump rules the live tracking system uses, then add the
    // accepted distance to the running total that drives the 5-km upload cadence.
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

    // Remember this fix so sensor-only samples can reuse the last known coords.
    lastKnownLocRef.current = { lat: latitude, lon: longitude };
    lastGpsTsRef.current    = nowMs;

    const sample: TelemetrySample = {
      ts:  loc.timestamp,
      lat: latitude,
      lon: longitude,
    };

    if (speed != null && speed >= 0) {
      const kmh = speed * 3.6;
      sample.speed_kmh = kmh;
      // EMA-smooth the GPS speed locally so the dead-reckoning fallback has a
      // believable starting velocity when GPS goes silent.
      emaSpeedRef.current = emaSpeedRef.current === 0
        ? kmh
        : SPEED_EMA_ALPHA * kmh + (1 - SPEED_EMA_ALPHA) * emaSpeedRef.current;
    }
    if (altitude != null) {
      sample.altitude_m = altitude;
    }
    if (heading != null && heading >= 0) {
      sample.heading = heading;
      headingRef.current = heading; // seed DR heading from the authoritative GPS course
    }
    sample.gforce_x   = accel.x;
    sample.gforce_y   = accel.y;
    sample.gforce_z   = accel.z;
    sample.lean_angle = calcLeanAngle(accel.x, accel.z);

    return sample;
  }, []);

  // ── build a sensor-only sample (no fresh GPS fix) ─────────────────────────
  // Dead-reckons position locally (Task #4705): from the last known coords, walk
  // forward by (decayed EMA speed × 1 s) along the DeviceMotion heading using
  // computeDestinationPoint, mark the sample `estimated`, and feed the estimate
  // back as the new last-known so the chain advances. When there is no prior fix
  // at all, lat/lon stay null (preserving the existing sensor-only contract).
  const buildSensorSample = useCallback((): TelemetrySample => {
    const accel = accelRef.current;
    const last  = lastKnownLocRef.current;

    // Bleed the speed estimate down so a stale velocity can't run forever.
    emaSpeedRef.current *= DR_SPEED_DECAY;

    let lat: number | null = last ? last.lat : null;
    let lon: number | null = last ? last.lon : null;
    let estimated = false;

    const heading = headingRef.current;
    if (last && typeof heading === "number" && emaSpeedRef.current > 0.5) {
      const stepKm = (emaSpeedRef.current / 3600) * (SAMPLE_INTERVAL_MS / 1000);
      if (stepKm > 0) {
        const next = computeDestinationPoint(last.lat, last.lon, stepKm, heading);
        lat = next.lat; lon = next.lng;
        // Advance the chain + count the dead-reckoned movement toward distance.
        lastKnownLocRef.current = { lat: next.lat, lon: next.lng };
        totalKmRef.current += stepKm;
        estimated = true;
      }
    }

    const sample: TelemetrySample = {
      ts:        Date.now(),
      lat,
      lon,
      gforce_x:  accel.x,
      gforce_y:  accel.y,
      gforce_z:  accel.z,
      lean_angle: calcLeanAngle(accel.x, accel.z),
    };
    if (emaSpeedRef.current > 0) sample.speed_kmh = emaSpeedRef.current;
    if (typeof heading === "number") sample.heading = heading;
    if (estimated) sample.estimated = true;
    return sample;
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
    } else {
      maybeUploadByDistance();
    }
  }, [buildSample, flush, maybeUploadByDistance, canRecordForeground]);

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
            } else {
              maybeUploadByDistance();
            }
          }
        );
        locationSubRef.current = sub;
      } catch (err) {
        console.warn("[useTelemetry] location subscription failed", err);
      }
    }

    // DeviceMotion at 1 Hz — heading source for dead reckoning (Task #4705).
    // rotation.alpha is radians, 0 = north; converted to degrees in [0,360).
    // Kept separate from the Accelerometer sub so g-force/lean sampling is
    // unchanged. Per-sample errors are isolated so one bad sample can't tear the
    // subscription down mid-ride.
    try {
      if (await DeviceMotion.isAvailableAsync()) {
        DeviceMotion.setUpdateInterval(SAMPLE_INTERVAL_MS);
        motionSubRef.current = DeviceMotion.addListener((data) => {
          try {
            const alpha = (data?.rotation as { alpha?: number } | undefined)?.alpha;
            if (typeof alpha === "number" && Number.isFinite(alpha)) {
              headingRef.current = (((alpha * 180) / Math.PI) % 360 + 360) % 360;
            }
          } catch {
            // never let a single motion sample crash the listener
          }
        });
      }
    } catch (err) {
      console.warn("[useTelemetry] DeviceMotion subscription failed", err);
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
      } else {
        maybeUploadByDistance();
      }
    }, SAMPLE_INTERVAL_MS);
    // No periodic wall-clock flush (Task #4705): uploads are now driven purely by
    // travelled distance (maybeUploadByDistance) plus force flushes on
    // stop/background/buffer-cap, so the app uploads sparingly and offline-first.
  }, [flush, buildSample, buildSensorSample, maybeUploadByDistance, canRecordForeground]);

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
    // Reset offline-first local processing state (Task #4705).
    totalKmRef.current        = 0;
    kmAtLastUploadRef.current = 0;
    lastDistPosRef.current    = null;
    emaSpeedRef.current       = 0;
    headingRef.current        = null;

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
