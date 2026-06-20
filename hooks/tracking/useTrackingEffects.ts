import { useEffect, useRef } from "react";
import { Animated, AppState } from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiRequest } from "@/lib/query-client";
import { emitMapsTelemetry } from "@/hooks/useMapTelemetry";
import { evaluateSegment, TRACKING_FUSION } from "@shared/tracking-fusion";
import { setHandsOffBroadcast, setSprintMeasuringBroadcast } from "@/lib/tracking-active";
import { logGpsError } from "@/lib/gps-logger";
import type { GpsPoint } from "@/components/tracking/useGpsTracking";

const BACKGROUND_LOCATION_TASK = "bikerlink-bg-location";
const BG_POINTS_KEY = "@bikerlink/bg_points_pending";
const BG_NOTIF_CONFIG_KEY = "@bikerlink/bg_notif_config";
const IDLE_THRESHOLD_KMH = 2;

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
}

export function useOnNativeLocation(deps: Omit<EffectDeps, "onNativeLocation" | "isTabFocused" | "isTabFocusedRef">) {
  const { t: _t, gps, sensors, sprint, bg, session, stats, settings, refs,
    handsOffActive, setHandsOffActive, setVolumeUI, totalGpsPointsRef,
    lastLowAccuracyTelemetryRef, handsOffDismissedForRideRef } = deps;

  return function onNativeLocation(loc: Location.LocationObject) {
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
    if (fixUsable) {
      gps.lastUsableFixMsRef.current = now;
      if (!gps.gpsFixAcquiredRef.current) { gps.gpsFixAcquiredRef.current = true; gps.setGpsFixAcquired(true); }
    }
    if (gps.lastPosRef.current) {
      if (gps.drGapKmRef.current > 0) {
        // Dead reckoning covered the GPS blackout. Only a QUALITY fix is trusted to
        // reseed the anchor + clear the gap (without adding the bridging segment, so
        // the gap isn't double-counted). A poor recovery fix keeps us in DR.
        if (fixUsable) {
          gps.drGapKmRef.current = 0;
          gps.lastPosRef.current = { lat: latitude, lng: longitude, time: now };
          if (settings.showMyRoute) { gps.mapCoordsRef.current = [...gps.mapCoordsRef.current, { latitude, longitude }]; gps.setMapCoords(gps.mapCoordsRef.current); }
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
  };
}

export function useTrackingEffects(deps: EffectDeps) {
  const { t, bg, session, settings, isTabFocused, totalGpsPointsRef, onNativeLocation } = deps;

  // AppState: background → start bg location; active → replay bg points
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next) => {
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
        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status === "granted" && gen === bg.bgStartGenRef.current) {
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
            const bgPoints: GpsPoint[] = JSON.parse(raw); await AsyncStorage.removeItem(BG_POINTS_KEY);
            bgPoints.forEach((p) => onNativeLocation({
              coords: { latitude: p.latitude, longitude: p.longitude, altitude: p.altitude, speed: p.speedKmh / 3.6, accuracy: 0, heading: 0, altitudeAccuracy: 0 },
              timestamp: new Date(p.timestamp).getTime(),
            } as Location.LocationObject));
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
    });
    return () => sub.remove();
  }, [t, bg, session, settings, onNativeLocation, totalGpsPointsRef, deps.isTabFocusedRef]);

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bug 4 recovery: retry GPS point batches persisted at stop time due to network failure
  useEffect(() => {
    (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const pendingKeys = keys.filter((k) => k.startsWith("@bikerlink/pending_points_"));
        for (const key of pendingKeys) {
          const raw = await AsyncStorage.getItem(key);
          if (!raw) { await AsyncStorage.removeItem(key).catch(() => {}); continue; }
          const routeId = key.replace("@bikerlink/pending_points_", "");
          try {
            const points: GpsPoint[] = JSON.parse(raw);
            if (points.length > 0) await apiRequest("POST", `/api/routes/${routeId}/points`, { points });
            await AsyncStorage.removeItem(key);
          } catch { /* network still unavailable — retry next mount */ }
        }
      } catch { /* AsyncStorage unavailable */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
