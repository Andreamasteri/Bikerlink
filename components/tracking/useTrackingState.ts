import { useState, useEffect, useRef, useCallback } from "react";
import { Alert, Animated, AppState } from "react-native";
import * as Location from "expo-location";
import { DeviceMotion } from "expo-sensors";
import { VolumeManager } from "react-native-volume-manager";
import * as Battery from "expo-battery";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

import { useT } from "@/lib/language-context";
import { useUnits } from "@/lib/units-context";
import { useMapConfig } from "@/lib/map-context";
import { useApiDebugLog } from "@/hooks/useApiDebugLog";
import { apiRequest, getQueryFn, queryClient } from "@/lib/query-client";
import { haversineKm } from "@/lib/geo";
import { setTrackingActive, setHandsOffBroadcast, setSprintMeasuringBroadcast } from "@/lib/tracking-active";
import { logGpsError } from "@/lib/gps-logger";
import { emitMapsTelemetry } from "@/hooks/useMapTelemetry";
import {
  loadBatteryDrainStats,
  appendBatteryDrainSample,
  BATTERY_MIN_RIDE_MINUTES,
} from "./tracking-utils";

import * as Haptics from "expo-haptics";
import * as TaskManager from "expo-task-manager";

// Sub-hooks
import { useGpsTracking, GpsPoint } from "./useGpsTracking";
import { useSensorTracking } from "./useSensorTracking";
import { useSprintTracking } from "./useSprintTracking";
import { useBatteryTracking } from "./useBatteryTracking";
import { useBackgroundTask } from "./useBackgroundTask";

import { useTrackingSession } from "@/hooks/tracking/useTrackingSession";
import { useTrackingStats } from "@/hooks/tracking/useTrackingStats";
import { useTrackingMap } from "@/hooks/tracking/useTrackingMap";
import { useTrackingSettings } from "@/hooks/tracking/useTrackingSettings";
import { useTrackingRefs } from "@/hooks/tracking/useTrackingRefs";
import { useOfflineQueue } from "@/hooks/tracking/useOfflineQueue";

// Types
export type Phase = "idle" | "countdown" | "active" | "paused";

export interface RouteRecord {
  id: string;
  title?: string | null;
  totalDistanceKm?: number;
  maxSpeedKmh?: number;
  avgSpeedKmh?: number;
  maxAltitude?: number;
  durationSeconds?: number;
  idleTimeSeconds?: number;
  status: string;
  createdAt: string;
  maxAccelerationG?: number | null;
  isSprint?: boolean;
  sprint0to100Ms?: number | null;
  gpsBlackoutCount?: number | null;
  gpsBlackoutSeconds?: number | null;
}

export interface LocalRouteRecord extends RouteRecord {
  isRecovered: true;
  notes: string;
}

// Constants
const BACKGROUND_LOCATION_TASK = "bikerlink-bg-location";
const BG_POINTS_KEY = "@bikerlink/bg_points_pending";
const BG_NOTIF_CONFIG_KEY = "@bikerlink/bg_notif_config";
const BG_SENSOR_SNAPSHOT_KEY = "@bikerlink/bg_sensor_snapshot";
const BG_NOTIF_THROTTLE = 5;

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const { locations } = data as { locations: Location.LocationObject[] };
    try {
      const raw = await AsyncStorage.getItem(BG_POINTS_KEY);
      const existing: unknown[] = raw ? JSON.parse(raw) : [];
      const sensorRaw = await AsyncStorage.getItem(BG_SENSOR_SNAPSHOT_KEY);
      const sensorSnapshot: { accelG?: number; tiltDeg?: number } | null = sensorRaw ? JSON.parse(sensorRaw) : null;
      const newPoints = locations.map((loc) => ({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude ?? 0,
        speedKmh: (loc.coords.speed ?? 0) * 3.6,
        timestamp: new Date(loc.timestamp).toISOString(),
        ...(sensorSnapshot ? { accelG: sensorSnapshot.accelG, tiltDeg: sensorSnapshot.tiltDeg } : {}),
      }));
      const newCount = existing.length + newPoints.length;
      await AsyncStorage.setItem(BG_POINTS_KEY, JSON.stringify([...existing, ...newPoints]));

      const prevBucket = Math.floor(existing.length / BG_NOTIF_THROTTLE);
      const curBucket = Math.floor(newCount / BG_NOTIF_THROTTLE);
      if (curBucket > prevBucket && newCount > 0) {
        try {
          const cfgRaw = await AsyncStorage.getItem(BG_NOTIF_CONFIG_KEY);
          if (cfgRaw) {
            const cfg = JSON.parse(cfgRaw);
            const pointsText = cfg.pointsLabel.replace("{count}", String(newCount));
            await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
              accuracy: cfg.accuracy,
              timeInterval: cfg.timeInterval,
              distanceInterval: cfg.distanceInterval,
              foregroundService: {
                notificationTitle: cfg.title,
                notificationBody: `${cfg.body} • ${pointsText}`,
                notificationColor: "#FF6600",
                killServiceOnDestroy: false,
              },
              pausesUpdatesAutomatically: false,
              activityType: Location.ActivityType.AutomotiveNavigation,
            }).catch(() => {});
          }
        } catch {
          // no-op: ignore background notification config load failures
        }
      }
    } catch {
      // no-op: ignore background location task failures
    }
  });
}
const IDLE_THRESHOLD_KMH = 2;
const GPS_BUFFER_SEGCOUNT_KEY = "@bikerlink/gps_buffer_segcount";
const GPS_BUFFER_SEG_KEY = (n: number) => `@bikerlink/gps_buffer_seg_${n}`;

export function useTrackingState() {
  const t = useT();
  const { speedUnit, distanceUnit } = useUnits();
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();

  const gps = useGpsTracking();
  const sensors = useSensorTracking();
  const sprint = useSprintTracking();
  const battery = useBatteryTracking();
  const bg = useBackgroundTask();

  const session = useTrackingSession();
  const stats = useTrackingStats();
  const mapState = useTrackingMap();
  const settings = useTrackingSettings();
  const refs = useTrackingRefs();
  const offlineQueue = useOfflineQueue();

  const [handsOffActive, setHandsOffActive] = useState(false);
  const { logs: debugLogs, clearLogs: clearDebugLogs, logFetch } = useApiDebugLog();
  const [debugVisible, setDebugVisible] = useState(__DEV__);
  const logFetchRef = useRef(logFetch);
  useEffect(() => { logFetchRef.current = logFetch; }, [logFetch]);
  const debugTapCount = useRef(0);
  const debugTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDebugTap = useCallback(() => {
    debugTapCount.current += 1;
    if (debugTapTimer.current) clearTimeout(debugTapTimer.current);
    if (debugTapCount.current >= 5) {
      debugTapCount.current = 0;
      setDebugVisible((v) => !v);
      return;
    }
    debugTapTimer.current = setTimeout(() => { debugTapCount.current = 0; }, 1500);
  }, []);

  const handsOffDismissedForRideRef = useRef(false);
  const totalGpsPointsRef = useRef(0);
  const lastLowAccuracyTelemetryRef = useRef(0);
  const [isTabFocused] = useState(true);
  const isTabFocusedRef = useRef(isTabFocused);

  // Sync refs
  useEffect(() => { settings.profileRef.current = settings.profile; }, [settings.profile, settings.profileRef]);
  useEffect(() => { settings.handsOffEnabledRef.current = settings.handsOffEnabled; }, [settings.handsOffEnabled, settings.handsOffEnabledRef]);
  useEffect(() => { settings.handsOffSpeedRef.current = parseFloat(settings.handsOffSpeedStr || "50") || 50; }, [settings.handsOffSpeedStr, settings.handsOffSpeedRef]);
  useEffect(() => { settings.is0100EnabledRef.current = settings.is0100Enabled; }, [settings.is0100Enabled, settings.is0100EnabledRef]);
  useEffect(() => { settings.sensorsEnabledRef.current = settings.sensorsEnabled; }, [settings.sensorsEnabled, settings.sensorsEnabledRef]);
  useEffect(() => { session.phaseRef.current = session.phase; }, [session.phase, session.phaseRef]);
  useEffect(() => { sensors.mountAxisCalibRef.current = sensors.mountAxisCalib; }, [sensors.mountAxisCalib, sensors.mountAxisCalibRef]);

  const { data: records, refetch: refetchRecords } = useQuery<RouteRecord[]>({ queryKey: ["/api/routes"] });
  const { data: sprintHistory } = useQuery<Array<{ sprint0to100Ms: number | null }>>({
    queryKey: ["/api/sprints"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: settings.is0100Enabled,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (sprintHistory && sprintHistory.length > 0 && sprintHistory[0].sprint0to100Ms != null) {
      sprint.personalBestMsRef.current = sprintHistory[0].sprint0to100Ms;
    } else {
      sprint.personalBestMsRef.current = null;
    }
  }, [sprintHistory, sprint]);

  const { data: phoneSensorsData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/phone-sensors-enabled"],
    staleTime: 120_000,
  });
  const phoneSensorsAdminEnabled = phoneSensorsData?.enabled === true;

  const flushPoints = useCallback(async () => {
    const toSend = [...refs.pointsBufferRef.current];
    if (toSend.length === 0) return;
    refs.pointsBufferRef.current = [];
    stats.setPointsBuffered(0);
    const rId = refs.routeIdRef.current;
    if (!rId) return;
    try {
      await apiRequest("POST", `/api/routes/${rId}/points`, { points: toSend });
      stats.totalPointsSentRef.current += toSend.length;
      stats.setPointsSent(stats.totalPointsSentRef.current);
    } catch (e) {
      logGpsError(e, "flushPoints", { routeId: rId ?? undefined });
      refs.pointsBufferRef.current = [...toSend, ...refs.pointsBufferRef.current];
      stats.setPointsBuffered(refs.pointsBufferRef.current.length);
    }
  }, [stats, refs]);

  const cleanupTracking = useCallback(() => {
    [refs.timerRef, refs.flushTimerRef, refs.gpsHeartbeatTimerRef, refs.countdownTickRef].forEach(r => {
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
      Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).then((h: boolean) => { if (h) Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK); });
    }
    setTrackingActive(false);
    gps.setGpsLost(false);
    bg.pendingBgToastCountRef.current = 0;
  }, [bg, gps, refs]);

  const resetTrackingState = useCallback(() => {
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
    bg.pendingBgToastCountRef.current = 0; gps.gpsBlackoutStartRef.current = null; handsOffDismissedForRideRef.current = false;
    totalGpsPointsRef.current = 0; bg.bgStartPointsRef.current = 0; bg.bgPointsCountRef.current = 0;
    refs.pointsBufferRef.current = [];
    if (sprint.sprintTimeoutRef.current) clearTimeout(sprint.sprintTimeoutRef.current);
    sprint.sprintTimeoutRef.current = null;
  }, [gps, sensors, sprint, stats, bg, refs]);

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

  const startDeviceMotion = useCallback(async () => {
    if (!settings.sensorsEnabledRef.current || sensors.sensorStartingRef.current) return;
    sensors.sensorStartingRef.current = true;
    try {
      if (await DeviceMotion.isAvailableAsync()) {
        sensors.sensorSourceRef.current = "deviceMotion"; DeviceMotion.setUpdateInterval(100);
        refs.accelSubRef.current = DeviceMotion.addListener(data => {
          if (!data.accelerationIncludingGravity || stats.isPausedRef.current) return;
          const { x, y, z } = data.accelerationIncludingGravity;
          const totalG = Math.sqrt(x * x + y * y + z * z) / 9.81;
          sensors.setCurrentG(totalG);
          let tiltDeg = 0, lateralG = 0, accelG = 0;
          if (sensors.mountAxisCalibRef.current) {
            const { x: ax, y: ay, z: az } = data.accelerationIncludingGravity;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MountAxisCalibration runtime shape
            const up = (sensors.mountAxisCalibRef.current as any).up, forward = (sensors.mountAxisCalibRef.current as any).forward;
            const right = { x: up.y * forward.z - up.z * forward.y, y: up.z * forward.x - up.x * forward.z, z: up.x * forward.y - up.y * forward.x };
            accelG = (ax * forward.x + ay * forward.y + az * forward.z) / 9.81;
            lateralG = (ax * right.x + ay * right.y + az * right.z) / 9.81;
            tiltDeg = Math.atan2(lateralG, (ax * up.x + ay * up.y + az * up.z) / 9.81) * (180 / Math.PI);
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DeviceMotion rotation.roll not typed in expo-sensors
            accelG = y / 9.81; lateralG = x / 9.81; tiltDeg = ((data.rotation as any).roll || 0) * (180 / Math.PI);
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

  const onNativeLocation = useCallback((loc: Location.LocationObject) => {
    if (stats.isPausedRef.current || session.phaseRef.current !== "active") return;
    const { latitude, longitude, altitude, speed, accuracy } = loc.coords;
    const now = loc.timestamp, speedKmh = speed != null && speed >= 0 ? speed * 3.6 : 0;
    const smoothedSpeed = gps.emaSpeedRef.current * 0.7 + speedKmh * 0.3;
    gps.emaSpeedRef.current = smoothedSpeed; gps.setCurrentSpeed(smoothedSpeed); gps.setGpsAccuracy(accuracy); gps.setCurrentCoord({ latitude, longitude });
    totalGpsPointsRef.current += 1; if (bg.bgTrackingActiveRef.current) bg.bgPointsCountRef.current += 1;
    // Task #2686 — telemetria GPS: segnala accuracy degradata (>30m) per il watchdog mappe.
    // Throttle a 60s per evitare spam (un fix di location può arrivare ogni secondo).
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
    if (gps.lastPosRef.current) {
      const dist = haversineKm(gps.lastPosRef.current.lat, gps.lastPosRef.current.lng, latitude, longitude);
      if (dist > 0.005) {
        gps.totalKmRef.current += dist; gps.setTotalKm(gps.totalKmRef.current);
        if (settings.showMyRoute) { gps.mapCoordsRef.current = [...gps.mapCoordsRef.current, { latitude, longitude }]; gps.setMapCoords(gps.mapCoordsRef.current); }
      }
    } else { gps.setMapCoords([{ latitude, longitude }]); gps.mapCoordsRef.current = [{ latitude, longitude }]; }
    gps.lastPosRef.current = { lat: latitude, lng: longitude, time: now };
    if (smoothedSpeed > gps.maxSpeedRef.current) { gps.maxSpeedRef.current = smoothedSpeed; gps.setMaxSpeed(smoothedSpeed); }
    if (altitude != null && altitude > gps.maxAltRef.current) { gps.maxAltRef.current = altitude; gps.setMaxAltitude(altitude); }
    const point: GpsPoint = { latitude, longitude, altitude: altitude ?? 0, speedKmh: smoothedSpeed, timestamp: new Date(now).toISOString(), accelG: sensors.currentAccelGRef.current, tiltDeg: sensors.currentTiltDegRef.current };
    refs.pointsBufferRef.current.push(point); stats.setPointsBuffered(refs.pointsBufferRef.current.length);
    if (settings.sensorsEnabledRef.current) refs.telemetryAccumRef.current.push({ timestamp: point.timestamp, lat: latitude, lon: longitude, leanAngle: sensors.currentTiltDegRef.current, gForceX: sensors.currentAccelGRef.current, speedKmh: smoothedSpeed });
    if (settings.handsOffEnabledRef.current && !handsOffDismissedForRideRef.current) {
      if (smoothedSpeed >= settings.handsOffSpeedRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- VolumeManager.showNativeVolumeUI not in typedefs
        if (!handsOffActive) { setHandsOffActive(true); setHandsOffBroadcast(true); (VolumeManager as any).showNativeVolumeUI(false); }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- VolumeManager.showNativeVolumeUI not in typedefs
      } else if (handsOffActive) { setHandsOffActive(false); setHandsOffBroadcast(false); (VolumeManager as any).showNativeVolumeUI(true); }
    }
  }, [gps, sensors, sprint, bg, handsOffActive, settings, stats, session, refs]);

  const beginActiveTracking = useCallback(async () => {
    session.setPhase("active"); stats.startTimeRef.current = Date.now(); stats.pausedMsRef.current = 0; stats.isPausedRef.current = false;
    if (await Battery.isAvailableAsync()) {
      const level = await Battery.getBatteryLevelAsync();
      battery.rideStartBatteryLevelRef.current = level; battery.rideStartBatteryTimeRef.current = Date.now(); battery.rideBatteryProfileRef.current = settings.profileRef.current;
    }
    refs.timerRef.current = setInterval(() => {
      if (stats.isPausedRef.current) return;
      const now = Date.now(); const activeMs = now - stats.startTimeRef.current - stats.pausedMsRef.current;
      stats.setDisplayIdleMs(stats.idleMsRef.current + (stats.idleStartRef.current ? now - stats.idleStartRef.current : 0));
      stats.setTotalMs(activeMs);
      if (now - stats.lastAvgSpeedUpdateRef.current > 5000) {
        stats.lastAvgSpeedUpdateRef.current = now; const hours = activeMs / 3600000;
        if (hours > 0) stats.setAvgSpeedDisplayKmh(gps.totalKmRef.current / hours);
      }
    }, 1000);
    refs.flushTimerRef.current = setInterval(() => !stats.isPausedRef.current && flushPoints(), 15000);
    refs.gpsHeartbeatTimerRef.current = setInterval(() => {
      if (stats.isPausedRef.current) return;
      const now = Date.now(), last = gps.lastPosRef.current?.time ?? stats.startTimeRef.current, lost = now - last > 15000;
      if (lost && !gps.gpsWasLostRef.current) { gps.gpsWasLostRef.current = true; gps.gpsBlackoutCountRef.current += 1; gps.gpsBlackoutStartRef.current = now; }
      else if (!lost && gps.gpsWasLostRef.current) {
        gps.gpsWasLostRef.current = false; if (gps.gpsBlackoutStartRef.current != null) { gps.gpsBlackoutSecondsRef.current += now - gps.gpsBlackoutStartRef.current; gps.gpsBlackoutStartRef.current = null; }
      }
      gps.setGpsLost(lost);
    }, 5000);
    const p = settings.profileRef.current, accuracy = p === "easy" ? Location.Accuracy.Balanced : p === "medium" ? Location.Accuracy.High : Location.Accuracy.BestForNavigation;
    const timeInterval = p === "easy" ? 2000 : p === "medium" ? 1000 : 500, distanceInterval = p === "easy" ? 5 : p === "medium" ? 2 : 0;
    try { refs.watchSubRef.current = await Location.watchPositionAsync({ accuracy, timeInterval, distanceInterval }, loc => onNativeLocation(loc)); }
    catch (e) { logGpsError(e, "watchPositionAsync"); Alert.alert(t("common.error"), t("tracking.gpsStartError")); cleanupTracking(); session.setPhase("idle"); return; }
    startDeviceMotion(); setTrackingActive(true); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [cleanupTracking, flushPoints, startDeviceMotion, t, gps, battery, session, stats, settings, refs, onNativeLocation]);

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
        refs.countdownTickRef.current = setInterval(() => session.setCountdownValue(v => {
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
    await flushPoints();

    // Pre-set summary data so the modal always has it regardless of PATCH outcome
    session.setCompletedRouteId(rId);
    mapState.setSummaryRoutePoints(gps.mapCoordsRef.current.map(c => ({ lat: c.latitude, lng: c.longitude })));

    let patchFailed = false;
    const updateData: {
      status: string; stoppedAt: string; totalDistanceKm: number; maxSpeedKmh: number; avgSpeedKmh: number; maxAltitude: number;
      durationSeconds: number; idleTimeSeconds: number; maxAccelerationG: number | null;
      isSprint: boolean; sprint0to100Ms: number | null; gpsBlackoutCount: number; gpsBlackoutSeconds: number;
      telemetryData?: string;
    } = {
      status: "completed", stoppedAt: new Date().toISOString(), totalDistanceKm: gps.totalKmRef.current, maxSpeedKmh: gps.maxSpeedRef.current, avgSpeedKmh: stats.avgSpeedDisplayKmh, maxAltitude: gps.maxAltRef.current,
      durationSeconds: Math.floor(stats.totalMs / 1000), idleTimeSeconds: Math.floor(stats.idleMsRef.current / 1000), maxAccelerationG: sensors.maxAccelGRef.current,
      isSprint: settings.is0100EnabledRef.current, sprint0to100Ms: sprint.sprint0to100MsRef.current, gpsBlackoutCount: gps.gpsBlackoutCountRef.current, gpsBlackoutSeconds: Math.floor(gps.gpsBlackoutSecondsRef.current / 1000),
    };
    if (settings.sensorsEnabledRef.current && refs.telemetryAccumRef.current.length > 0) updateData.telemetryData = JSON.stringify(refs.telemetryAccumRef.current);
    try {
      await apiRequest("PATCH", `/api/routes/${rId}`, updateData);
      if (settings.sensorsEnabledRef.current && refs.telemetryAccumRef.current.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/telemetry/stats"] });
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
      } catch { /* battery level unavailable on this device — ignore silently */ }
    } catch (e) {
      logGpsError(e, "handleStop");
      patchFailed = true;
      await offlineQueue.enqueue(rId, updateData as unknown as Record<string, unknown>, "complete").catch(() => {});
    }
    finally {
      session.setSummaryPatchFailed(patchFailed);
      session.setSummaryVisible(true);
      session.setPhase("idle"); session.setLoading(false); setHandsOffActive(false); setHandsOffBroadcast(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- VolumeManager.showNativeVolumeUI not in typedefs
      (VolumeManager as any).showNativeVolumeUI(true);
    }
  }, [cleanupTracking, flushPoints, stats, gps, sensors, sprint, battery, refetchRecords, t, session, settings, mapState, refs, offlineQueue]);

  const handlePause = useCallback(() => {
    if (session.phaseRef.current !== "active" && session.phaseRef.current !== "paused") return;
    if (stats.isPausedRef.current) { stats.pausedMsRef.current += Date.now() - stats.pauseStartRef.current; stats.isPausedRef.current = false; session.setPhase("active"); }
    else { stats.pauseStartRef.current = Date.now(); stats.isPausedRef.current = true; session.setPhase("paused"); flushPoints(); }
  }, [flushPoints, session, stats]);

  const handleRecalibrate = useCallback(() => {
    [sensors.maxAccelGRef, sensors.maxDecelGRef, sensors.maxTiltDegRef, sensors.maxLateralGRef].forEach(r => r.current = 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sensor setter array, all accept number
    [sensors.setMaxAccelG, sensors.setMaxDecelG, sensors.setMaxTiltDeg, sensors.setMaxLateralG, sensors.setCurrentG, sensors.setCurrentLateralG, sensors.setCurrentTiltDeg, sensors.setShowSensorOverlay].forEach(f => (f as any)(0));
    sensors.setShowSensorOverlay(false);
    if (sensors.sensorSourceRef.current === "accelerometer") { sensors.setIsCalibrating(true); sensors.accelBaselineRef.current = null; sensors.accelCalibSamples.current = []; }
  }, [sensors]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async next => {
      if (session.phaseRef.current !== "active") return;
      if (next === "background") {
        bg.bgStartGenRef.current += 1; const gen = bg.bgStartGenRef.current; bg.bgStartPointsRef.current = totalGpsPointsRef.current; bg.bgPointsCountRef.current = 0;
        const p = settings.profileRef.current, accuracy = p === "easy" ? Location.Accuracy.Balanced : p === "medium" ? Location.Accuracy.High : Location.Accuracy.BestForNavigation;
        const ti = p === "easy" ? 2000 : p === "medium" ? 1000 : 500, di = p === "easy" ? 10 : p === "medium" ? 5 : 2;
        await AsyncStorage.setItem(BG_NOTIF_CONFIG_KEY, JSON.stringify({ title: t("tracking.bgTitle"), body: t("tracking.bgBody"), pointsLabel: t("tracking.bgPointsLabel"), accuracy, timeInterval: ti, distanceInterval: di }));
        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status === "granted" && gen === bg.bgStartGenRef.current) {
          bg.bgTrackingActiveRef.current = true;
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, { accuracy, timeInterval: ti, distanceInterval: di, foregroundService: { notificationTitle: t("tracking.bgTitle"), notificationBody: t("tracking.bgBody"), notificationColor: "#FF6600", killServiceOnDestroy: false }, pausesUpdatesAutomatically: false, activityType: Location.ActivityType.AutomotiveNavigation });
        }
      } else if (next === "active") {
        bg.bgStartGenRef.current += 1;
        if (bg.bgTrackingActiveRef.current) {
          bg.bgTrackingActiveRef.current = false; await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
          const raw = await AsyncStorage.getItem(BG_POINTS_KEY);
          if (raw) {
            const bgPoints: GpsPoint[] = JSON.parse(raw); await AsyncStorage.removeItem(BG_POINTS_KEY);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LocationObject partial shape, native handler accepts it
            bgPoints.forEach(p => onNativeLocation({ coords: { latitude: p.latitude, longitude: p.longitude, altitude: p.altitude, speed: p.speedKmh / 3.6, accuracy: 0, heading: 0, altitudeAccuracy: 0 }, timestamp: new Date(p.timestamp).getTime() } as any));
            if (bgPoints.length > 0) {
              if (isTabFocusedRef.current) {
                bg.setBgToastCount(bgPoints.length); bg.setBgToastVisible(true);
                Animated.sequence([Animated.timing(bg.bgToastAnim, { toValue: 1, duration: 400, useNativeDriver: true }), Animated.delay(4000), Animated.timing(bg.bgToastAnim, { toValue: 0, duration: 400, useNativeDriver: true })]).start(() => bg.setBgToastVisible(false));
              } else bg.pendingBgToastCountRef.current = bgPoints.length;
            }
          }
        }
      }
    });
    return () => sub.remove();
  }, [t, bg, session, settings, onNativeLocation]);

  useEffect(() => {
    if (isTabFocused && bg.pendingBgToastCountRef.current > 0) {
      bg.setBgToastCount(bg.pendingBgToastCountRef.current); bg.pendingBgToastCountRef.current = 0; bg.setBgToastVisible(true);
      Animated.sequence([Animated.timing(bg.bgToastAnim, { toValue: 1, duration: 400, useNativeDriver: true }), Animated.delay(4000), Animated.timing(bg.bgToastAnim, { toValue: 0, duration: 400, useNativeDriver: true })]).start(() => bg.setBgToastVisible(false));
    }
  }, [isTabFocused, bg]);

  // Cleanup una-tantum del buffer GPS offline legacy (funzione rimossa).
  // Questi segmenti ring non venivano mai riletti per il recovery e potevano
  // crescere fino a saturare AsyncStorage (SQLITE_FULL), rompendo la mappa.
  // Li svuotiamo al mount per liberare i device già intasati.
  useEffect(() => {
    AsyncStorage.multiRemove([
      GPS_BUFFER_SEGCOUNT_KEY,
      ...Array.from({ length: 50 }, (_, i) => GPS_BUFFER_SEG_KEY(i)),
    ]).catch(() => {});
  }, []);

  return {
    state: {
      profile: settings.profile, countdownEnabled: settings.countdownEnabled, countdownSec: settings.countdownSec, handsOffEnabled: settings.handsOffEnabled, handsOffSpeedStr: settings.handsOffSpeedStr,
      is0100Enabled: settings.is0100Enabled, showMyRoute: settings.showMyRoute, sensorsEnabled: settings.sensorsEnabled, showMountCalibWizard: settings.showMountCalibWizard, mountAxisCalib: sensors.mountAxisCalib,
      phase: session.phase, handsOffActive, loading: session.loading, summaryVisible: session.summaryVisible, summaryPatchFailed: session.summaryPatchFailed, mapModalVisible: mapState.mapModalVisible, summaryRoutePoints: mapState.summaryRoutePoints, routeMapVisible: mapState.routeMapVisible,
      publishRecord: session.publishRecord, publishCaption: session.publishCaption, recoveredRecords: session.recoveredRecords, rideTitle: session.rideTitle, completedRouteId: session.completedRouteId,
      histMapVisible: mapState.histMapVisible, histMapPoints: mapState.histMapPoints, histMapRecord: mapState.histMapRecord, histMapLoading: mapState.histMapLoading,
      currentSpeed: gps.currentSpeed, gpsAccuracy: gps.gpsAccuracy, gpsLost: gps.gpsLost, totalKm: gps.totalKm, maxSpeed: gps.maxSpeed, maxAltitude: gps.maxAltitude, mapCoords: gps.mapCoords, currentCoord: gps.currentCoord,
      totalMs: stats.totalMs, displayIdleMs: stats.displayIdleMs, currentG: sensors.currentG, currentLateralG: sensors.currentLateralG, currentTiltDeg: sensors.currentTiltDeg, maxAccelG: sensors.maxAccelG, maxDecelG: sensors.maxDecelG, maxLateralG: sensors.maxLateralG, maxTiltDeg: sensors.maxTiltDeg,
      isCalibrating: sensors.isCalibrating, showSensorOverlay: sensors.showSensorOverlay, countdownValue: session.countdownValue, countdownAnim: session.countdownAnim,
      sprintPhase: sprint.sprintPhase, sprintGoFired: sprint.sprintGoFired, sprint0to100Ms: sprint.sprint0to100Ms, isNewRecord: sprint.isNewRecord, recordAnim: sprint.recordAnim, personalBestMs: sprint.personalBestMsRef.current,
      pointsSent: stats.pointsSent, pointsBuffered: stats.pointsBuffered, batteryDrainStats: battery.batteryDrainStats, showBatteryStats: battery.showBatteryStats, debugLogs, debugVisible, bgToastCount: bg.bgToastCount, bgToastVisible: bg.bgToastVisible, bgToastAnim: bg.bgToastAnim,
      records, phoneSensorsAdminEnabled, isPending: session.isPublishPending, speedUnit, distanceUnit, mapsEnabled, resolvedProvider,
      offlineQueuePendingCount: offlineQueue.pendingCount, offlineQueueLastSyncedCount: offlineQueue.lastSyncedCount,
    },
    handlers: {
      setProfile: settings.setProfile, setCountdownEnabled: settings.setCountdownEnabled, setCountdownSec: settings.setCountdownSec, setHandsOffEnabled: settings.setHandsOffEnabled, setHandsOffSpeedStr: settings.setHandsOffSpeedStr, setIs0100Enabled: settings.setIs0100Enabled,
      setShowMyRoute: settings.setShowMyRoute, setShowMountCalibWizard: settings.setShowMountCalibWizard, setMountAxisCalib: sensors.setMountAxisCalib, setPhase: session.setPhase, setLoading: session.setLoading, setSummaryVisible: session.setSummaryVisible,
      setMapModalVisible: mapState.setMapModalVisible, setRouteMapVisible: mapState.setRouteMapVisible, setPublishRecord: session.setPublishRecord, setPublishCaption: session.setPublishCaption, setRideTitle: session.setRideTitle, setHistMapVisible: mapState.setHistMapVisible,
      setShowSensorOverlay: sensors.setShowSensorOverlay, setShowBatteryStats: battery.setShowBatteryStats, setDebugVisible, handleDebugTap, clearDebugLogs, handleStart, handleStop, handlePause, handleRecalibrate,
      handleDeleteRecord: (id: string) => stats.handleDeleteRecord(id, refetchRecords), handleViewHistoricalRoute: mapState.handleViewHistoricalRoute, handleExportGpx: mapState.handleExportGpx, handlePublish: session.handlePublish, discardSprintAttempt, refetchRecords,
      enqueueOfflinePatch: offlineQueue.enqueue, clearOfflineLastSynced: offlineQueue.clearLastSyncedCount,
      handleSaveVoiceNote: async (note: string): Promise<boolean> => {
        const rId = refs.routeIdRef.current;
        if (!rId) return false;
        try {
          await apiRequest("POST", `/api/routes/${rId}/voice-notes`, { text: note.slice(0, 2000) });
          return true;
        } catch {
          return false;
        }
      },
    },
    avgSpeedDisplayKmh: stats.avgSpeedDisplayKmh,
  };
}
