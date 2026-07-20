import { useEffect } from "react";
import { Animated, AppState } from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiRequest } from "@/lib/query-client";
import { markAsyncError } from "@/lib/crash-logger";
import { emitMapsTelemetry } from "@/hooks/useMapTelemetry";
import { evaluateSegment, TRACKING_FUSION } from "@shared/tracking-fusion";
import {
  haversineMeters,
  bearingDeg,
  angleDiffDeg,
  RECOVERY_FIXES_REQUIRED,
  RECOVERY_COHERENCE_MAX_KMH,
  type DrDeviationSample,
} from "@shared/dr-correction";
import { reportDrDeviation } from "@/lib/dr-deviation-uploader";
import { setHandsOffBroadcast, setSprintMeasuringBroadcast } from "@/lib/tracking-active";
import { logGpsError } from "@/lib/gps-logger";
import type { GpsPoint } from "@/components/tracking/useGpsTracking";

const BACKGROUND_LOCATION_TASK = "bikerlink-bg-location";
const BG_POINTS_KEY = "@bikerlink/bg_points_pending";
const BG_NOTIF_CONFIG_KEY = "@bikerlink/bg_notif_config";
const IDLE_THRESHOLD_KMH = 2;
// Resume-path caps for the pending-points recovery (Task #4585): bound each POST
// and the whole recovery pass so a slow network on mount/resume can't keep the
// loop running indefinitely. Untried keys simply retry on the next mount.
const PENDING_POINTS_REQUEST_TIMEOUT_MS = 8_000;
const PENDING_POINTS_BUDGET_MS = 15_000;

// Task #938 — bg-point replay: process in batches of this size, yielding the JS
// main thread between batches via setTimeout(0) to prevent multi-second freezes
// on resume. A Samsung S24 Ultra with 29 minutes of background tracking produced
// ~1758 synchronous onNativeLocation calls that blocked the thread for 29 minutes.
// Cap the total replay at BG_REPLAY_MAX_POINTS so a very long background session
// can't OOM the device; excess (oldest) points are silently discarded — distance
// continuity is maintained via dead-reckoning which ran live during the blackout.
const BG_REPLAY_BATCH_SIZE = 20;
const BG_REPLAY_MAX_POINTS = 300; // ~5 minutes at 1 Hz; beyond this DR was already estimating

/* eslint-disable @typescript-eslint/no-explicit-any */
interface EffectDeps {
  t: (key: string) => string;
  gps: any;
  sensors: any;
  sprint: any;
  bg: any;
  session: any;
  stats: any;
  settings: any;
  refs: any;
  handsOffActive: boolean;
  setHandsOffActive: (v: boolean) => void;
  setVolumeUI: (v: boolean) => void;
  isTabFocused: boolean;
  isTabFocusedRef: React.MutableRefObject<boolean>;
  totalGpsPointsRef: React.MutableRefObject<number>;
  lastLowAccuracyTelemetryRef: React.MutableRefObject<number>;
  handsOffDismissedForRideRef: React.MutableRefObject<boolean>;
  onNativeLocation: (loc: Location.LocationObject) => void;
  requestBackgroundPermission: () => Promise<"granted" | "denied" | "needsSettings">;
}

export function useOnNativeLocation(deps: Omit<EffectDeps, "onNativeLocation" | "isTabFocused" | "isTabFocusedRef">) {
  const { t: _t, gps, sensors, sprint, bg, session, stats, settings, refs,
    handsOffActive, setHandsOffActive, setVolumeUI, totalGpsPointsRef,
    lastLowAccuracyTelemetryRef, handsOffDismissedForRideRef } = deps;

  return function onNativeLocation(loc: Location.LocationObject) {
    // Per-fix error isolation (Task #4612): a throw while processing a single
    // (possibly malformed) GPS fix must NOT propagate out of this callback —
    // that would bubble through the watchPositionAsync listener and can tear
    // down the whole GPS path. Catch + log here so GPS degrades cleanly and the
    // sensors/dead-reckoning fusion loop keeps recording. The fusion timer in
    // useTrackingState already falls back to sensors_only when GPS goes stale.
    try {
    if (stats.isPausedRef.current || session.phaseRef.current !== "active") return;
    const { latitude, longitude, altitude, speed, accuracy } = loc.coords;
    const now = loc.timestamp, speedKmh = speed != null && speed >= 0 ? speed * 3.6 : 0;
    const smoothedSpeed = gps.emaSpeedRef.current * 0.7 + speedKmh * 0.3;
    gps.emaSpeedRef.current = smoothedSpeed; gps.setCurrentSpeed(smoothedSpeed); gps.setGpsAccuracy(accuracy); gps.setCurrentCoord({ latitude, longitude });
    totalGpsPointsRef.current += 1; if (bg.bgTrackingActiveRef.current) bg.bgPointsCountRef.current += 1;
    if (accuracy != null && accuracy > 30 && now - lastLowAccuracyTelemetryRef.current > 60_000) {
      lastLowAccuracyTelemetryRef.current = now;
      emitMapsTelemetry({ event: "gps_low_accuracy", component: "useTrackingState", details: { accuracyM: accuracy } });
    }
    if (smoothedSpeed < IDLE_THRESHOLD_KMH) {
      if (!stats.isIdleRef.current) { stats.isIdleRef.current = true; stats.idleStartRef.current = now; }
    } else if (stats.isIdleRef.current) {
      stats.isIdleRef.current = false; if (stats.idleStartRef.current) stats.idleMsRef.current += now - stats.idleStartRef.current; stats.idleStartRef.current = null;
    }
    if (settings.is0100EnabledRef.current) {
      if (sprint.sprintPhaseRef.current === "waiting" && smoothedSpeed >= 5) {
        sprint.sprintPhaseRef.current = "measuring"; sprint.sprintStartTimeRef.current = now; sprint.setSprintPhase("measuring"); setSprintMeasuringBroadcast(true);
      } else if (sprint.sprintPhaseRef.current === "measuring" && smoothedSpeed >= 100) {
        const diff = now - (sprint.sprintStartTimeRef.current || now);
        sprint.sprintPhaseRef.current = "completed"; sprint.sprint0to100MsRef.current = diff; sprint.setSprintPhase("completed"); sprint.setSprint0to100Ms(diff); setSprintMeasuringBroadcast(false);
      }
    }
    gps.lastAccuracyRef.current = accuracy ?? null;
    // A fix only counts as "acquired" / usable as a distance reference once it
    // passes the accuracy gate. A noisy first fix must NOT flip us out of the
    // acquiring state nor seed lastPosRef, or the next good fix produces a large
    // plausible-speed segment = phantom km.
    const fixUsable = accuracy == null || accuracy <= TRACKING_FUSION.ACCURACY_GATE_M;
    // A raw callback (any quality) keeps the blackout heartbeat alive. Only a
    // quality fix marks GPS as "fresh" for fusion and is allowed to anchor distance.
    gps.lastGpsEventMsRef.current = now;
    // Are we mid-recovery from a blackout (frozen anchor + accumulated DR gap) and
    // NOT yet confirmed? While pending we deliberately keep GPS "stale" for fusion.
    const inUnconfirmedRecovery = !!gps.lastPosRef.current && gps.drGapKmRef.current > 0;
    if (fixUsable) {
      if (!gps.gpsFixAcquiredRef.current) { gps.gpsFixAcquiredRef.current = true; gps.setGpsFixAcquired(true); }
      // Defer the fusion-freshness marker until recovery is CONFIRMED (Task #47). If
      // we marked GPS fresh on the FIRST recovery fix, the fusion loop would leave
      // sensors_only and stop dead-reckoning accumulation, while the GPS segment path
      // is still bypassed (drGapKm>0) until confirmation — a multi-fix window of
      // movement counted by NEITHER path (systematic undercount). Keeping it stale
      // keeps DR accumulating continuously; we set it at confirmation below.
      if (!inUnconfirmedRecovery) gps.lastUsableFixMsRef.current = now;
    }
    if (gps.lastPosRef.current) {
      if (gps.drGapKmRef.current > 0) {
        // Dead reckoning covered the GPS blackout. The first recovery fix is often
        // noisy (tunnel exit / multipath), so we do NOT trust it immediately:
        // instead we wait for RECOVERY_FIXES_REQUIRED coherent consecutive usable
        // fixes (Task #47). Crucially, distance accumulation stays CONTINUOUS during
        // this wait: GPS freshness is deferred (see above) so fusion remains in
        // sensors_only and DR keeps adding to totalKm + drGapKm every tick. We only
        // withhold the GPS *segment* (anchor→recovery bridging) so nothing is
        // double-counted. The frozen anchor + the accumulating gap are read FRESH at
        // confirmation below, not snapshotted at the first fix (which would understate
        // the gap by the DR distance travelled during the recovery wait).
        if (fixUsable) {
          const pending = gps.drRecoveryPendingRef.current;
          if (!pending) {
            gps.drRecoveryPendingRef.current = {
              lastFixLat: latitude, lastFixLng: longitude, lastFixTime: now, fixCount: 1,
            };
          } else {
            // Coherence between consecutive recovery fixes: an implausible jump
            // resets the streak so we keep waiting for a stable lock.
            const stepKm = haversineMeters(pending.lastFixLat, pending.lastFixLng, latitude, longitude) / 1000;
            const stepH = Math.max((now - pending.lastFixTime) / 3_600_000, 1e-6);
            const impliedKmh = stepKm / stepH;
            pending.fixCount = impliedKmh <= RECOVERY_COHERENCE_MAX_KMH ? pending.fixCount + 1 : 1;
            pending.lastFixLat = latitude; pending.lastFixLng = longitude; pending.lastFixTime = now;
          }

          const p = gps.drRecoveryPendingRef.current;
          if (p && p.fixCount >= RECOVERY_FIXES_REQUIRED) {
            // Confirmed ground truth: record the DR-vs-GPS deviation, then reconcile
            // by clearing the gap and reseeding the anchor to the recovery position.
            // No bridging segment is added between anchor and recovery, so the
            // sensor-only blackout distance is never re-counted as GPS distance.
            const anchor = gps.lastPosRef.current;
            const drEst = refs.drEstPosRef?.current ?? null;
            const drGapKm = gps.drGapKmRef.current;
            const sessionId = refs.routeIdRef?.current ?? null;
            if (sessionId && anchor) {
              const gpsDistanceKm = haversineMeters(anchor.lat, anchor.lng, latitude, longitude) / 1000;
              const posErrorM = drEst
                ? haversineMeters(drEst.lat, drEst.lon, latitude, longitude)
                : Math.abs(gpsDistanceKm - drGapKm) * 1000;
              const headingErrorDeg = drEst
                ? angleDiffDeg(
                    bearingDeg(anchor.lat, anchor.lng, drEst.lat, drEst.lon),
                    bearingDeg(anchor.lat, anchor.lng, latitude, longitude),
                  )
                : null;
              const sample: DrDeviationSample = {
                sessionId: String(sessionId),
                blackoutMs: Math.max(0, now - anchor.time),
                drDistanceKm: drGapKm,
                gpsDistanceKm,
                posErrorM,
                estSpeedKmh: gps.drSpeedKmhRef.current ?? 0,
                obsSpeedKmh: smoothedSpeed,
                headingErrorDeg,
                recoveryAccuracyM: accuracy ?? 0,
                recoveryFixCount: p.fixCount,
              };
              reportDrDeviation(sample);
            }
            gps.drGapKmRef.current = 0;
            gps.lastPosRef.current = { lat: latitude, lng: longitude, time: now };
            // Recovery confirmed — GPS is authoritative again for fusion.
            gps.lastUsableFixMsRef.current = now;
            gps.drRecoveryPendingRef.current = null;
            if (settings.showMyRoute) { gps.mapCoordsRef.current = [...gps.mapCoordsRef.current, { latitude, longitude }]; gps.setMapCoords(gps.mapCoordsRef.current); }
          }
        } else {
          // A poor recovery fix breaks the coherent streak — restart when a good one returns.
          gps.drRecoveryPendingRef.current = null;
        }
      } else {
        const decision = evaluateSegment({
          prevLat: gps.lastPosRef.current.lat, prevLng: gps.lastPosRef.current.lng,
          prevTimeMs: gps.lastPosRef.current.time,
          lat: latitude, lng: longitude, timeMs: now, accuracyM: accuracy,
        });
        if (decision.accept) {
          gps.totalKmRef.current += decision.distanceKm; gps.setTotalKm(gps.totalKmRef.current);
          if (settings.showMyRoute) { gps.mapCoordsRef.current = [...gps.mapCoordsRef.current, { latitude, longitude }]; gps.setMapCoords(gps.mapCoordsRef.current); }
          // Advance the reference ONLY on an accepted segment, so sub-floor moves in
          // tight curves accumulate across fixes instead of being silently dropped.
          gps.lastPosRef.current = { lat: latitude, lng: longitude, time: now };
        }
        // Reject (jitter / jump / low-accuracy): do NOT touch lastPosRef. Keeping the
        // last ACCEPTED position+time lets dt grow so the next good fix is plausible
        // (no speed-jump self-lock); the heartbeat uses lastGpsEventMsRef instead.
      }
    } else if (fixUsable) {
      // Seed the distance reference only from a quality fix, so the first counted
      // segment starts from a trustworthy origin (no phantom km).
      gps.setMapCoords([{ latitude, longitude }]); gps.mapCoordsRef.current = [{ latitude, longitude }];
      gps.lastPosRef.current = { lat: latitude, lng: longitude, time: now };
    }
    if (smoothedSpeed > gps.maxSpeedRef.current) { gps.maxSpeedRef.current = smoothedSpeed; gps.setMaxSpeed(smoothedSpeed); }
    if (altitude != null && altitude > gps.maxAltRef.current) { gps.maxAltRef.current = altitude; gps.setMaxAltitude(altitude); }
    const point: GpsPoint = { latitude, longitude, altitude: altitude ?? 0, speedKmh: smoothedSpeed, timestamp: new Date(now).toISOString(), accelG: sensors.currentAccelGRef.current, tiltDeg: sensors.currentTiltDegRef.current };
    refs.pointsBufferRef.current.push(point); stats.setPointsBuffered(refs.pointsBufferRef.current.length);
    if (settings.sensorsEnabledRef.current) refs.telemetryAccumRef.current.push({ timestamp: point.timestamp, lat: latitude, lon: longitude, leanAngle: sensors.currentTiltDegRef.current, gForceX: sensors.currentAccelGRef.current, speedKmh: smoothedSpeed, mode: gps.fusionModeRef.current });
    if (settings.handsOffEnabledRef.current && !handsOffDismissedForRideRef.current) {
      if (smoothedSpeed >= settings.handsOffSpeedRef.current) {
        if (!handsOffActive) { setHandsOffActive(true); setHandsOffBroadcast(true); setVolumeUI(false); }
      } else if (handsOffActive) { setHandsOffActive(false); setHandsOffBroadcast(false); setVolumeUI(true); }
    }
    } catch (e) {
      // GPS fix processing failed — degrade GPS cleanly without propagating, so
      // the throw can't bubble through watchPositionAsync and tear down the GPS
      // path. Explicitly invalidate this fix's freshness marker so the fusion
      // loop downgrades immediately (gpsFresh -> false => sensors_only when
      // sensors are active, else gps_only) instead of waiting for the staleness
      // timeout. A subsequent clean fix re-arms lastUsableFixMs and restores
      // gps_sensors. Routed through logGpsError (same pipeline flushPoints uses)
      // with a recognizable tag so it stays visible in diagnostics.
      try { gps.lastUsableFixMsRef.current = 0; } catch { /* no-op */ }
      logGpsError(e, "tracking_gps_fix");
    }
  };
}

export function useTrackingEffects(deps: EffectDeps) {
  const { t, bg, session, settings, isTabFocused, totalGpsPointsRef, onNativeLocation, requestBackgroundPermission } = deps;

  // AppState: background → start bg location; active → replay bg points
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next) => {
      // Whole body guarded: this is an async listener, so any unguarded rejection
      // (native location call failing on poor network, corrupted JSON, etc.)
      // would otherwise surface as an unhandled rejection that can close the app
      // on resume from background. We catch, record, and degrade gracefully.
      try {
      if (session.phaseRef.current !== "active") return;
      if (next === "background") {
        bg.bgStartGenRef.current += 1; const gen = bg.bgStartGenRef.current;
        bg.bgStartPointsRef.current = totalGpsPointsRef.current; bg.bgPointsCountRef.current = 0;
        const p = settings.profileRef.current;
        const accuracy = p === "easy" ? Location.Accuracy.Balanced : p === "medium" ? Location.Accuracy.High : Location.Accuracy.BestForNavigation;
        const ti = p === "easy" ? 2000 : p === "medium" ? 1000 : 500;
        const di = p === "easy" ? 10 : p === "medium" ? 5 : 2;
        await AsyncStorage.setItem(BG_NOTIF_CONFIG_KEY, JSON.stringify({
          title: t("tracking.bgTitle"), body: t("tracking.bgBody"),
          pointsLabel: t("tracking.bgPointsLabel"), accuracy, timeInterval: ti, distanceInterval: di,
        }));
        const bgResult = await requestBackgroundPermission();
        if (bgResult === "granted" && gen === bg.bgStartGenRef.current) {
          bg.bgTrackingActiveRef.current = true;
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy, timeInterval: ti, distanceInterval: di,
            foregroundService: { notificationTitle: t("tracking.bgTitle"), notificationBody: t("tracking.bgBody"), notificationColor: "#FF6600", killServiceOnDestroy: false },
            pausesUpdatesAutomatically: false, activityType: Location.ActivityType.AutomotiveNavigation,
          });
        }
      } else if (next === "active") {
        bg.bgStartGenRef.current += 1;
        if (bg.bgTrackingActiveRef.current) {
          bg.bgTrackingActiveRef.current = false;
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
          const raw = await AsyncStorage.getItem(BG_POINTS_KEY);
          if (raw) {
            const allBgPoints: GpsPoint[] = JSON.parse(raw); await AsyncStorage.removeItem(BG_POINTS_KEY);
            // Task #938 — async batched replay to prevent JS thread freeze on resume.
            // Excess oldest points are dropped (DR already estimated that distance).
            const bgPoints = allBgPoints.length > BG_REPLAY_MAX_POINTS
              ? allBgPoints.slice(allBgPoints.length - BG_REPLAY_MAX_POINTS)
              : allBgPoints;
            for (let i = 0; i < bgPoints.length; i += BG_REPLAY_BATCH_SIZE) {
              const batch = bgPoints.slice(i, i + BG_REPLAY_BATCH_SIZE);
              for (const p of batch) {
                onNativeLocation({
                  coords: { latitude: p.latitude, longitude: p.longitude, altitude: p.altitude, speed: p.speedKmh / 3.6, accuracy: 0, heading: 0, altitudeAccuracy: 0 },
                  timestamp: new Date(p.timestamp).getTime(),
                } as Location.LocationObject);
              }
              // Yield the JS main thread between batches so the app stays responsive.
              if (i + BG_REPLAY_BATCH_SIZE < bgPoints.length) {
                await new Promise<void>((r) => setTimeout(r, 0));
              }
            }
            if (bgPoints.length > 0) {
              if (deps.isTabFocusedRef.current) {
                bg.setBgToastCount(bgPoints.length); bg.setBgToastVisible(true);
                Animated.sequence([
                  Animated.timing(bg.bgToastAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
                  Animated.delay(4000),
                  Animated.timing(bg.bgToastAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
                ]).start(() => bg.setBgToastVisible(false));
              } else { bg.pendingBgToastCountRef.current = bgPoints.length; }
            }
          }
        }
      }
      } catch (e) {
        markAsyncError("tracking_app_state", e).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [t, bg, session, settings, onNativeLocation, totalGpsPointsRef, deps.isTabFocusedRef, requestBackgroundPermission]);

  // Show pending bg toast when tab comes back to focus
  useEffect(() => {
    if (isTabFocused && bg.pendingBgToastCountRef.current > 0) {
      bg.setBgToastCount(bg.pendingBgToastCountRef.current); bg.pendingBgToastCountRef.current = 0; bg.setBgToastVisible(true);
      Animated.sequence([
        Animated.timing(bg.bgToastAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(4000),
        Animated.timing(bg.bgToastAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => bg.setBgToastVisible(false));
    }
  }, [isTabFocused, bg]);

  // Legacy GPS buffer cleanup (one-time, avoids AsyncStorage saturation)
  const GPS_BUFFER_SEGCOUNT_KEY = "@bikerlink/gps_buffer_segcount";
  const GPS_BUFFER_SEG_KEY = (n: number) => `@bikerlink/gps_buffer_seg_${n}`;
  useEffect(() => {
    AsyncStorage.removeMany([GPS_BUFFER_SEGCOUNT_KEY, ...Array.from({ length: 50 }, (_, i) => GPS_BUFFER_SEG_KEY(i))]).catch(() => {});
  }, []);  

  // Bug 4 recovery: retry GPS point batches persisted at stop time due to network failure
  useEffect(() => {
    (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const pendingKeys = keys.filter((k) => k.startsWith("@bikerlink/pending_points_"));
        const deadline = Date.now() + PENDING_POINTS_BUDGET_MS;
        for (const key of pendingKeys) {
          if (Date.now() > deadline) break; // budget exceeded — remaining keys retry next mount
          const raw = await AsyncStorage.getItem(key);
          if (!raw) { await AsyncStorage.removeItem(key).catch(() => {}); continue; }
          const routeId = key.replace("@bikerlink/pending_points_", "");
          try {
            const points: GpsPoint[] = JSON.parse(raw);
            if (points.length > 0) await apiRequest("POST", `/api/routes/${routeId}/points`, { points }, { timeoutMs: PENDING_POINTS_REQUEST_TIMEOUT_MS });
            await AsyncStorage.removeItem(key);
          } catch { /* network still unavailable — retry next mount */ }
        }
      } catch { /* AsyncStorage unavailable */ }
    })();
  }, []);  
}
