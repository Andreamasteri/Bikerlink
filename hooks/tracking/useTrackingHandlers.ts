import { useCallback, useRef } from "react";
import { Alert, Animated } from "react-native";
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
    [refs.timerRef, refs.flushTimerRef, refs.gpsHeartbeatTimerRef, refs.countdownTickRef].forEach((r: any) => {
      if (r.current) clearInterval(r.current);
      r.current = null;
    });
    if (refs.countdownGoTimeoutRef.current) clearTimeout(refs.countdownGoTimeoutRef.current);
    refs.countdownGoTimeoutRef.current = null;
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
    stats.setTotalMs(0); stats.setDisplayIdleMs(0); stats.setPointsBuffered(0); stats.setPointsSent(0); stats.setAvgSpeedDisplayKmh(0);
    sensors.setCurrentG(0); sensors.setCurrentLateralG(0); sensors.setCurrentTiltDeg(0); sensors.setMaxAccelG(0); sensors.setMaxDecelG(0); sensors.setMaxLateralG(0); sensors.setMaxTiltDeg(0); sensors.setShowSensorOverlay(false);
    sprint.setSprintPhase("waiting"); sprint.setSprint0to100Ms(null); sprint.setIsNewRecord(false); sprint.recordAnim.setValue(0);
    gps.totalKmRef.current = 0; gps.maxSpeedRef.current = 0; gps.maxAltRef.current = 0; gps.lastPosRef.current = null; gps.mapCoordsRef.current = [];
    refs.routeIdRef.current = null; stats.totalPointsSentRef.current = 0; stats.idleMsRef.current = 0; stats.idleStartRef.current = null; stats.isIdleRef.current = false;
    sensors.accelBaselineRef.current = null; sensors.accelCalibSamples.current = []; sensors.maxAccelGRef.current = 0; sensors.maxDecelGRef.current = 0; sensors.maxTiltDegRef.current = 0; sensors.maxLateralGRef.current = 0; sensors.sensorStartingRef.current = false;
    sprint.sprintStartTimeRef.current = null; sprint.sprintPhaseRef.current = "waiting"; sprint.setSprintGoFired(false); sprint.sprint0to100MsRef.current = null;
    gps.emaSpeedRef.current = 0; stats.lastAvgSpeedUpdateRef.current = 0; stats.pausedMsRef.current = 0; stats.isPausedRef.current = false;
    sensors.setIsCalibrating(false);
    gps.gpsWasLostRef.current = false; refs.telemetryAccumRef.current = []; gps.gpsBlackoutCountRef.current = 0; gps.gpsBlackoutSecondsRef.current = 0;
    bg.pendingBgToastCountRef.current = 0; gps.gpsBlackoutStartRef.current = null;
    refs.pointsBufferRef.current = [];
    if (sprint.sprintTimeoutRef.current) clearTimeout(sprint.sprintTimeoutRef.current);
    sprint.sprintTimeoutRef.current = null;
  };
}

export function useTrackingHandlers(deps: TrackingHandlerDeps) {
  const { t, gps, sensors, sprint, battery, bg, session, stats, settings, mapState, refs, offlineQueue,
    handsOffActive, setHandsOffActive, setVolumeUI, refetchRecords, flushPoints, beginActiveTracking,
    resetTrackingState, cleanupTracking } = deps;

  const startDeviceMotion = useCallback(async () => {
    if (!settings.sensorsEnabledRef.current || sensors.sensorStartingRef.current) return;
    sensors.sensorStartingRef.current = true;
    try {
      if (await DeviceMotion.isAvailableAsync()) {
        sensors.sensorSourceRef.current = "deviceMotion"; DeviceMotion.setUpdateInterval(100);
        refs.accelSubRef.current = DeviceMotion.addListener((data: any) => {
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
          sensors.setCurrentLateralG(lateralG); sensors.setCurrentTiltDeg(tiltDeg);
          if (accelG > sensors.maxAccelGRef.current) { sensors.maxAccelGRef.current = accelG; sensors.setMaxAccelG(accelG); }
          if (accelG < sensors.maxDecelGRef.current) { sensors.maxDecelGRef.current = accelG; sensors.setMaxDecelG(accelG); }
          if (Math.abs(tiltDeg) > sensors.maxTiltDegRef.current) { sensors.maxTiltDegRef.current = Math.abs(tiltDeg); sensors.setMaxTiltDeg(Math.abs(tiltDeg)); }
          if (Math.abs(lateralG) > sensors.maxLateralGRef.current) { sensors.maxLateralGRef.current = Math.abs(lateralG); sensors.setMaxLateralG(Math.abs(lateralG)); }
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
