import { useCallback } from "react";
import { Alert } from "react-native";
import * as Location from "expo-location";
import { DeviceMotion } from "expo-sensors";
import * as Battery from "expo-battery";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useT } from "@/lib/language-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { setTrackingActive, setHandsOffBroadcast, setSprintMeasuringBroadcast } from "@/lib/tracking-active";
import { logGpsError } from "@/lib/gps-logger";
import { loadBatteryDrainStats, appendBatteryDrainSample, BATTERY_MIN_RIDE_MINUTES } from "@/components/tracking/tracking-utils";
import { MountAxisCalibration } from "@/components/MountCalibWizard";
import type { GpsPoint } from "@/components/tracking/useGpsTracking";

const BACKGROUND_LOCATION_TASK = "bikerlink-bg-location";
const BG_POINTS_KEY = "@bikerlink/bg_points_pending";
const MAP_LAST_GPS_KEY = "map_last_gps";
const GHOST_MODE_KEY = "@bikerlink/ghost_mode_active";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface TrackingHandlerDeps {
  t: ReturnType<typeof useT>;
  gps: any;
  sensors: any;
  sprint: any;
  battery: any;
  bg: any;
  session: any;
  stats: any;
  settings: any;
  mapState: any;
  refs: any;
  offlineQueue: any;
  handsOffActive: boolean;
  setHandsOffActive: (v: boolean) => void;
  setVolumeUI: (v: boolean) => void;
  refetchRecords: () => void;
  flushPoints: () => Promise<void>;
  beginActiveTracking: () => Promise<void>;
  resetTrackingState: () => void;
  cleanupTracking: () => void;
}

export function buildCleanupTracking(deps: Pick<TrackingHandlerDeps, "bg" | "gps" | "refs">) {
  return function cleanupTracking() {
    const { bg, gps, refs } = deps;
    [refs.timerRef, refs.flushTimerRef, refs.gpsHeartbeatTimerRef, refs.countdownTickRef, refs.fusionTimerRef].forEach((r: any) => {
      if (r.current) clearInterval(r.current);
      r.current = null;
    });
    if (refs.countdownGoTimeoutRef.current) clearTimeout(refs.countdownGoTimeoutRef.current);
    refs.countdownGoTimeoutRef.current = null;
    if (refs.watchUpgradeTimeoutRef.current) clearTimeout(refs.watchUpgradeTimeoutRef.current);
    refs.watchUpgradeTimeoutRef.current = null;
    if (refs.watchSubRef.current) refs.watchSubRef.current.remove();
    refs.watchSubRef.current = null;
    if (refs.accelSubRef.current) refs.accelSubRef.current.remove();
    refs.accelSubRef.current = null;
    if (bg.bgTrackingActiveRef.current) {
      bg.bgTrackingActiveRef.current = false;
      Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).then((h: boolean) => {
        if (h) Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      });
    }
    setTrackingActive(false);
    gps.setGpsLost(false);
    bg.pendingBgToastCountRef.current = 0;
  };
}

export function buildResetTrackingState(deps: Pick<TrackingHandlerDeps, "gps" | "sensors" | "sprint" | "stats" | "bg" | "refs">) {
  return function resetTrackingState() {
    const { gps, sensors, sprint, stats, bg, refs } = deps;
    gps.setCurrentSpeed(0); gps.setTotalKm(0); gps.setMaxSpeed(0); gps.setMaxAltitude(0); gps.setMapCoords([]); gps.setCurrentCoord(null);
    gps.setGpsFixAcquired(false); gps.setFusionMode("acquiring");
    gps.gpsFixAcquiredRef.current = false; gps.fusionModeRef.current = "acquiring"; gps.lastAccuracyRef.current = null;
    gps.lastGpsEventMsRef.current = 0; gps.lastUsableFixMsRef.current = 0;
    gps.drSpeedKmhRef.current = 0; gps.drGapKmRef.current = 0; gps.divergenceCountRef.current = 0;
    stats.setTotalMs(0); stats.setDisplayIdleMs(0); stats.setPointsBuffered(0); stats.setPointsSent(0); stats.setAvgSpeedDisplayKmh(0);
    sensors.setCurrentG(0); sensors.setCurrentLateralG(0); sensors.setCurrentTiltDeg(0); sensors.setMaxAccelG(0); sensors.setMaxDecelG(0); sensors.setMaxLateralG(0); sensors.setMaxTiltDeg(0); sensors.setShowSensorOverlay(false);
    sprint.setSprintPhase("waiting"); sprint.setSprint0to100Ms(null); sprint.setIsNewRecord(false); sprint.recordAnim.setValue(0);
    gps.totalKmRef.current = 0; gps.maxSpeedRef.current = 0; gps.maxAltRef.current = 0; gps.lastPosRef.current = null; gps.mapCoordsRef.current = [];
    refs.routeIdRef.current = null; stats.totalPointsSentRef.current = 0; stats.idleMsRef.current = 0; stats.idleStartRef.current = null; stats.isIdleRef.current = false;
    sensors.accelBaselineRef.current = null; sensors.accelCalibSamples.current = []; sensors.maxAccelGRef.current = 0; sensors.maxDecelGRef.current = 0; sensors.maxTiltDegRef.current = 0; sensors.maxLateralGRef.current = 0; sensors.sensorStartingRef.current = false;
    sensors.linearAccelFwdRef.current = 0; sensors.gravityEstRef.current = null; sensors.currentAccelGRef.current = 0; sensors.currentLateralGRef.current = 0; sensors.currentTiltDegRef.current = 0;
    sprint.sprintStartTimeRef.current = null; sprint.sprintPhaseRef.current = "waiting"; sprint.setSprintGoFired(false); sprint.sprint0to100MsRef.current = null;
    gps.emaSpeedRef.current = 0; stats.lastAvgSpeedUpdateRef.current = 0; stats.pausedMsRef.current = 0; stats.isPausedRef.current = false;
    sensors.setIsCalibrating(false);
    gps.gpsWasLostRef.current = false; refs.telemetryAccumRef.current = []; gps.gpsBlackoutCountRef.current = 0; gps.gpsBlackoutSecondsRef.current = 0;
    refs.headingRef.current = null; refs.drEstPosRef.current = null;
    bg.pendingBgToastCountRef.current = 0; gps.gpsBlackoutStartRef.current = null;
    refs.pointsBufferRef.current = [];
    if (sprint.sprintTimeoutRef.current) clearTimeout(sprint.sprintTimeoutRef.current);
    sprint.sprintTimeoutRef.current = null;
  };
}

export function useTrackingHandlers(deps: TrackingHandlerDeps) {
  const { t, gps, sensors, sprint, battery, bg: _bg, session, stats, settings, mapState, refs, offlineQueue,
    handsOffActive: _handsOffActive, setHandsOffActive, setVolumeUI, refetchRecords, flushPoints, beginActiveTracking,
    resetTrackingState, cleanupTracking } = deps;

  const startDeviceMotion = useCallback(async () => {
    if (!settings.sensorsEnabledRef.current || sensors.sensorStartingRef.current) return;
    sensors.sensorStartingRef.current = true;
    try {
      if (await DeviceMotion.isAvailableAsync()) {
        sensors.sensorSourceRef.current = "deviceMotion"; DeviceMotion.setUpdateInterval(100);
        // Consecutive sample-failure streak (Task #4612): a single transient throw
        // must not drop sensors, but a sustained run of failures means the source
        // is unreliable. After SENSOR_ERROR_DROP_THRESHOLD straight failures we
        // explicitly mark the sensor source unavailable so the fusion loop
        // deterministically degrades to gps_only instead of trusting a broken
        // source. The streak resets on the first clean sample.
        let sensorErrorStreak = 0;
        const SENSOR_ERROR_DROP_THRESHOLD = 10;
        refs.accelSubRef.current = DeviceMotion.addListener((data: any) => {
          // Per-sample error isolation (Task #4612): a throw on a single sensor
          // sample must NOT propagate out of the listener — that would tear down
          // the DeviceMotion subscription and silently kill the sensors source
          // mid-ride. Catch + log here so the GPS path keeps recording and the
          // next sample is processed cleanly. This is separate from the setup
          // try/catch below (which guards subscription creation, not samples).
          try {
            if (!data.accelerationIncludingGravity || stats.isPausedRef.current) return;
            const { x, y, z } = data.accelerationIncludingGravity;
            const totalG = Math.sqrt(x * x + y * y + z * z) / 9.81;
            sensors.setCurrentG(totalG);
            let tiltDeg = 0, lateralG = 0, accelG = 0;
            if (sensors.mountAxisCalibRef.current) {
              const { x: ax, y: ay, z: az } = data.accelerationIncludingGravity;
              interface CalibVectors { up: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } }
              const { up, forward } = sensors.mountAxisCalibRef.current as MountAxisCalibration & CalibVectors;
              const right = { x: up.y * forward.z - up.z * forward.y, y: up.z * forward.x - up.x * forward.z, z: up.x * forward.y - up.y * forward.x };
              accelG = (ax * forward.x + ay * forward.y + az * forward.z) / 9.81;
              lateralG = (ax * right.x + ay * right.y + az * right.z) / 9.81;
              tiltDeg = Math.atan2(lateralG, (ax * up.x + ay * up.y + az * up.z) / 9.81) * (180 / Math.PI);
            } else {
              accelG = y / 9.81; lateralG = x / 9.81; tiltDeg = ((data.rotation as { roll?: number }).roll || 0) * (180 / Math.PI);
            }
            sensors.currentAccelGRef.current = accelG; sensors.currentLateralGRef.current = lateralG; sensors.currentTiltDegRef.current = tiltDeg;
            // Compass heading for dead reckoning (Task #4705): rotation.alpha is in
            // radians, 0 = north. Convert to degrees in [0,360). Used as the travel
            // direction to estimate position while GPS is silent.
            const alpha = (data.rotation as { alpha?: number } | undefined)?.alpha;
            if (typeof alpha === "number" && Number.isFinite(alpha)) {
              refs.headingRef.current = (((alpha * 180) / Math.PI) % 360 + 360) % 360;
            }
            // Gravity-compensated forward linear acceleration (m/s²) for dead reckoning.
            // Prefer the OS-fused linear acceleration; otherwise estimate gravity with a
            // low-pass complementary filter and subtract it from the raw vector.
            let lin = data.acceleration as { x: number; y: number; z: number } | null | undefined;
            if (!lin) {
              const g = sensors.gravityEstRef.current ?? { x, y, z };
              const a = 0.9; // smoothing → gravity is the slow-moving component
              g.x = a * g.x + (1 - a) * x; g.y = a * g.y + (1 - a) * y; g.z = a * g.z + (1 - a) * z;
              sensors.gravityEstRef.current = g;
              lin = { x: x - g.x, y: y - g.y, z: z - g.z };
            }
            let linFwd: number;
            if (sensors.mountAxisCalibRef.current) {
              const { forward } = sensors.mountAxisCalibRef.current as MountAxisCalibration & { forward: { x: number; y: number; z: number } };
              linFwd = lin.x * forward.x + lin.y * forward.y + lin.z * forward.z;
            } else {
              linFwd = lin.y;
            }
            // Zero-velocity-update clamp: ignore sub-threshold noise so a stationary
            // device doesn't drift speed/distance upward during a GPS blackout.
            sensors.linearAccelFwdRef.current = Math.abs(linFwd) < 0.3 ? 0 : linFwd;
            sensors.setCurrentLateralG(lateralG); sensors.setCurrentTiltDeg(tiltDeg);
            if (accelG > sensors.maxAccelGRef.current) { sensors.maxAccelGRef.current = accelG; sensors.setMaxAccelG(accelG); }
            if (accelG < sensors.maxDecelGRef.current) { sensors.maxDecelGRef.current = accelG; sensors.setMaxDecelG(accelG); }
            if (Math.abs(tiltDeg) > sensors.maxTiltDegRef.current) { sensors.maxTiltDegRef.current = Math.abs(tiltDeg); sensors.setMaxTiltDeg(Math.abs(tiltDeg)); }
            if (Math.abs(lateralG) > sensors.maxLateralGRef.current) { sensors.maxLateralGRef.current = Math.abs(lateralG); sensors.setMaxLateralG(Math.abs(lateralG)); }
            sensorErrorStreak = 0;
          } catch (e) {
            logGpsError(e, "tracking_sensor_sample");
            sensorErrorStreak += 1;
            // Sustained sample failures → drop sensors as a source. sensorsActive
            // (settings + sensorSourceRef !== "none") then goes false, so the
            // fusion loop falls back to gps_only on its next tick and publishes it
            // via setFusionMode — deterministic degradation, not timeout-driven.
            if (sensorErrorStreak >= SENSOR_ERROR_DROP_THRESHOLD && sensors.sensorSourceRef.current !== "none") {
              sensors.sensorSourceRef.current = "none";
              sensors.linearAccelFwdRef.current = 0;
            }
          }
        });
      }
    } catch (e) { logGpsError(e, "startDeviceMotion"); } finally { sensors.sensorStartingRef.current = false; }
  }, [sensors, stats, settings, refs]);

  const discardSprintAttempt = useCallback(() => {
    cleanupTracking();
    const failedId = refs.routeIdRef.current;
    refs.routeIdRef.current = null;
    session.setPhase("idle");
    setSprintMeasuringBroadcast(false);
    refs.pointsBufferRef.current = [];
    stats.setPointsBuffered(0);
    if (failedId) apiRequest("DELETE", `/api/routes/${failedId}`).catch(() => {});
    sprint.sprintPhaseRef.current = "waiting"; sprint.sprint0to100MsRef.current = null; sprint.sprintStartTimeRef.current = null;
    sprint.setSprintPhase("waiting"); sprint.setSprint0to100Ms(null);
  }, [cleanupTracking, sprint, session, stats, refs]);

  const handleStart = useCallback(async () => {
    if (session.phase !== "idle") return;
    session.setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { session.setLoading(false); Alert.alert(t("tracking.permReq"), t("tracking.permDenied")); return; }
      Location.requestBackgroundPermissionsAsync().catch(() => {});
      const res = await (await apiRequest("POST", "/api/routes", { status: "active", isSprint: !!settings.is0100EnabledRef.current })).json() as { id: string };
      if (!res?.id) throw new Error("Server did not return a valid route id");
      resetTrackingState(); refs.routeIdRef.current = res.id;
      console.log("[handleStart] routeId set:", res.id);
      if (settings.countdownEnabled) {
        session.setPhase("countdown"); session.setCountdownValue(parseInt(settings.countdownSec || "10", 10)); session.setLoading(false);
        refs.countdownTickRef.current = setInterval(() => session.setCountdownValue((v: number) => {
          if (v <= 1) { if (refs.countdownTickRef.current) clearInterval(refs.countdownTickRef.current); refs.countdownTickRef.current = null; return 0; }
          return v - 1;
        }), 1000);
        refs.countdownGoTimeoutRef.current = setTimeout(() => { session.setCountdownValue(0); beginActiveTracking(); }, parseInt(settings.countdownSec || "10", 10) * 1000);
      } else { session.setLoading(false); beginActiveTracking(); }
    } catch (e) { logGpsError(e, "handleStart"); Alert.alert(t("common.error"), t("tracking.routeCreateError")); session.setLoading(false); }
  }, [beginActiveTracking, settings, session, resetTrackingState, t, refs]);

  const handleStop = useCallback(async () => {
    if (session.phaseRef.current === "idle") return;
    const rId = refs.routeIdRef.current;
    session.setLoading(true); cleanupTracking();
    if (!rId) {
      session.setPhase("idle"); session.setLoading(false);
      Alert.alert(t("common.error"), t("tracking.routeNotCreatedError"));
      return;
    }
    try {
      const bgRaw = await AsyncStorage.getItem(BG_POINTS_KEY);
      if (bgRaw) {
        const bgPoints: GpsPoint[] = JSON.parse(bgRaw);
        await AsyncStorage.removeItem(BG_POINTS_KEY);
        if (bgPoints.length > 0) { refs.pointsBufferRef.current = [...bgPoints, ...refs.pointsBufferRef.current]; stats.setPointsBuffered(refs.pointsBufferRef.current.length); }
      }
    } catch { /* ignore */ }

    await flushPoints();

    if (refs.pointsBufferRef.current.length > 0) {
      try {
        await AsyncStorage.setItem(`@bikerlink/pending_points_${rId}`, JSON.stringify(refs.pointsBufferRef.current));
        refs.pointsBufferRef.current = []; stats.setPointsBuffered(0);
      } catch { /* ignore */ }
    }

    const lastCoord = gps.lastPosRef.current;
    if (lastCoord) {
      try {
        await AsyncStorage.setItem(
          MAP_LAST_GPS_KEY,
          JSON.stringify({ latitude: lastCoord.lat, longitude: lastCoord.lng })
        );
      } catch { /* ignore: cache write is best-effort */ }
    }

    session.setCompletedRouteId(rId);
    mapState.setSummaryRoutePoints(gps.mapCoordsRef.current.map((c: any) => ({ lat: c.latitude, lng: c.longitude })));

    let stopFailed = false;
    const stopPayload = {
      totalDistanceKm: gps.totalKmRef.current, maxSpeedKmh: gps.maxSpeedRef.current,
      avgSpeedKmh: stats.avgSpeedDisplayKmh, maxAltitude: gps.maxAltRef.current,
      durationSeconds: Math.floor(stats.totalMs / 1000), idleTimeSeconds: Math.floor(stats.idleMsRef.current / 1000),
      maxAccelerationG: sensors.maxAccelGRef.current, sprint0to100Ms: sprint.sprint0to100MsRef.current,
      gpsBlackoutCount: gps.gpsBlackoutCountRef.current, gpsBlackoutSeconds: Math.floor(gps.gpsBlackoutSecondsRef.current / 1000),
    };
    try {
      await apiRequest("PUT", `/api/routes/${rId}/stop`, stopPayload);
      if (settings.sensorsEnabledRef.current && refs.telemetryAccumRef.current.length > 0) {
        apiRequest("PATCH", `/api/routes/${rId}`, { telemetryData: JSON.stringify(refs.telemetryAccumRef.current) })
          .then(() => { queryClient.invalidateQueries({ queryKey: ["/api/telemetry/stats"] }); })
          .catch((e: unknown) => logGpsError(e, "handleStop/telemetry"));
      }
      refetchRecords();
      try {
        if (battery.rideStartBatteryLevelRef.current !== null) {
          const diff = battery.rideStartBatteryLevelRef.current - await Battery.getBatteryLevelAsync();
          if ((Date.now() - battery.rideStartBatteryTimeRef.current) / 60000 >= BATTERY_MIN_RIDE_MINUTES) {
            await appendBatteryDrainSample(battery.rideBatteryProfileRef.current, Math.max(0, diff * 100));
            battery.setBatteryDrainStats(await loadBatteryDrainStats());
          }
        }
      } catch { /* battery unavailable */ }
    } catch (e) {
      logGpsError(e, "handleStop"); stopFailed = true;
      await offlineQueue.enqueue(rId, stopPayload as unknown as Record<string, unknown>, "complete").catch(() => {});
    } finally {
      session.setSummaryPatchFailed(stopFailed); session.setSummaryVisible(true);
      session.setPhase("idle"); session.setLoading(false); setHandsOffActive(false); setHandsOffBroadcast(false);
      setVolumeUI(true);
    }
  }, [cleanupTracking, flushPoints, stats, gps, sensors, sprint, battery, refetchRecords, t, session, settings, mapState, refs, offlineQueue, setVolumeUI, setHandsOffActive]);

  const handlePause = useCallback(() => {
    if (session.phaseRef.current !== "active" && session.phaseRef.current !== "paused") return;
    if (stats.isPausedRef.current) { stats.pausedMsRef.current += Date.now() - stats.pauseStartRef.current; stats.isPausedRef.current = false; session.setPhase("active"); }
    else { stats.pauseStartRef.current = Date.now(); stats.isPausedRef.current = true; session.setPhase("paused"); flushPoints(); }
  }, [flushPoints, session, stats]);

  const handleRecalibrate = useCallback(() => {
    [sensors.maxAccelGRef, sensors.maxDecelGRef, sensors.maxTiltDegRef, sensors.maxLateralGRef].forEach((r: any) => r.current = 0);
    sensors.setMaxAccelG(0); sensors.setMaxDecelG(0); sensors.setMaxTiltDeg(0); sensors.setMaxLateralG(0);
    sensors.setCurrentG(0); sensors.setCurrentLateralG(0); sensors.setCurrentTiltDeg(0);
    sensors.setShowSensorOverlay(false);
    if (sensors.sensorSourceRef.current === "accelerometer") { sensors.setIsCalibrating(true); sensors.accelBaselineRef.current = null; sensors.accelCalibSamples.current = []; }
  }, [sensors]);

  return { startDeviceMotion, discardSprintAttempt, handleStart, handleStop, handlePause, handleRecalibrate };
}

export { GHOST_MODE_KEY };
