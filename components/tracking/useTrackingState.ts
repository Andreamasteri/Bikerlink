import { useState, useEffect, useRef, useCallback } from "react";
import { Alert } from "react-native";
import * as Location from "expo-location";
import * as Battery from "expo-battery";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

import { useT } from "@/lib/language-context";
import { useUnits } from "@/lib/units-context";
import { useMapConfig } from "@/lib/map-context";
import { useLocationGate } from "@/lib/location-context";
import { useApiDebugLog } from "@/hooks/useApiDebugLog";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import { setTrackingActive } from "@/lib/tracking-active";
import { logGpsError } from "@/lib/gps-logger";
import { TRACKING_FUSION, computeDestinationPoint, type FusionMode } from "@shared/tracking-fusion";

import * as Haptics from "expo-haptics";
import * as TaskManager from "expo-task-manager";

// Sub-hooks
import { useGpsTracking } from "./useGpsTracking";
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
import { useVolumeManager } from "@/hooks/useVolumeManager";
import {
  buildCleanupTracking,
  buildResetTrackingState,
  useTrackingHandlers,
} from "@/hooks/tracking/useTrackingHandlers";
import { useOnNativeLocation, useTrackingEffects } from "@/hooks/tracking/useTrackingEffects";

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
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        altitude: loc.coords.altitude ?? 0, speedKmh: (loc.coords.speed ?? 0) * 3.6,
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
              accuracy: cfg.accuracy, timeInterval: cfg.timeInterval, distanceInterval: cfg.distanceInterval,
              foregroundService: { notificationTitle: cfg.title, notificationBody: `${cfg.body} • ${pointsText}`, notificationColor: "#FF6600", killServiceOnDestroy: false },
              pausesUpdatesAutomatically: false, activityType: Location.ActivityType.AutomotiveNavigation,
            }).catch(() => {});
          }
        } catch { /* ignore bg notif config failures */ }
      }
    } catch { /* ignore bg location task failures */ }
  });
}

export function useTrackingState() {
  const t = useT();
  const { speedUnit, distanceUnit } = useUnits();
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const { requestBackgroundPermission } = useLocationGate();

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

  const volumeButtonCallbackRef = useRef<() => void>(() => {});
  const stableVolumeCallback = useCallback(() => { volumeButtonCallbackRef.current(); }, []);
  const { setVolumeUI } = useVolumeManager({ phase: session.phase, onVolumeButton: stableVolumeCallback });

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
    if (debugTapCount.current >= 5) { debugTapCount.current = 0; setDebugVisible((v) => !v); return; }
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
    queryKey: ["/api/sprints"], queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: settings.is0100Enabled, staleTime: 60_000,
  });

  useEffect(() => {
    if (sprintHistory && sprintHistory.length > 0 && sprintHistory[0].sprint0to100Ms != null) {
      sprint.personalBestMsRef.current = sprintHistory[0].sprint0to100Ms;
    } else { sprint.personalBestMsRef.current = null; }
  }, [sprintHistory, sprint]);

  const { data: phoneSensorsData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/phone-sensors-enabled"], staleTime: 120_000,
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

      const lastPt = toSend[toSend.length - 1];
      if (lastPt) {
        const ghostMode = await AsyncStorage.getItem("@bikerlink/ghost_mode_active").catch(() => null);
        if (ghostMode !== "true") {
          apiRequest("PUT", "/api/users/location", {
            latitude: lastPt.latitude,
            longitude: lastPt.longitude,
          }).catch(() => {});
        }
      }
    } catch (e) {
      logGpsError(e, "flushPoints", { routeId: rId ?? undefined });
      refs.pointsBufferRef.current = [...toSend, ...refs.pointsBufferRef.current];
      stats.setPointsBuffered(refs.pointsBufferRef.current.length);
    }
  }, [stats, refs]);

  const cleanupTrackingFn = buildCleanupTracking({ bg, gps, refs });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cleanupTracking = useCallback(cleanupTrackingFn, [bg, gps, refs]);

  const resetTrackingStateFn = buildResetTrackingState({ gps, sensors, sprint, stats, bg, refs });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resetTrackingState = useCallback(resetTrackingStateFn, [gps, sensors, sprint, stats, bg, refs]);

  const onNativeLocationFn = useOnNativeLocation({ t, gps, sensors, sprint, bg, session, stats, settings, refs, handsOffActive, setHandsOffActive, setVolumeUI, totalGpsPointsRef, lastLowAccuracyTelemetryRef, handsOffDismissedForRideRef, requestBackgroundPermission });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onNativeLocation = useCallback(onNativeLocationFn, [gps, sensors, sprint, bg, handsOffActive, settings, stats, session, refs, setVolumeUI]);

  // startDeviceMotionRef lets beginActiveTracking call startDeviceMotion without a
  // forward-reference problem (startDeviceMotion is declared by useTrackingHandlers below).
  const startDeviceMotionRef = useRef<() => Promise<void>>(async () => {});

  const beginActiveTracking = useCallback(async () => {
    session.setPhase("active"); stats.startTimeRef.current = Date.now(); stats.pausedMsRef.current = 0; stats.isPausedRef.current = false;
    if (await Battery.isAvailableAsync()) {
      const level = await Battery.getBatteryLevelAsync();
      battery.rideStartBatteryLevelRef.current = level; battery.rideStartBatteryTimeRef.current = Date.now(); battery.rideBatteryProfileRef.current = settings.profileRef.current;
    }
    refs.timerRef.current = setInterval(() => {
      // Per-tick error isolation (Task #4612): a transient throw inside the
      // display/stats tick must not kill the loop — log it and let the next
      // tick run. The other tracking loops keep running independently.
      try {
        if (stats.isPausedRef.current) return;
        const now = Date.now(); const activeMs = now - stats.startTimeRef.current - stats.pausedMsRef.current;
        stats.setDisplayIdleMs(stats.idleMsRef.current + (stats.idleStartRef.current ? now - stats.idleStartRef.current : 0));
        stats.setTotalMs(activeMs);
        if (now - stats.lastAvgSpeedUpdateRef.current > 5000) {
          stats.lastAvgSpeedUpdateRef.current = now; const hours = activeMs / 3600000;
          if (hours > 0) stats.setAvgSpeedDisplayKmh(gps.totalKmRef.current / hours);
        }
      } catch (e) { logGpsError(e, "tracking_tick_display"); }
    }, 1000);
    refs.flushTimerRef.current = setInterval(() => {
      // Per-tick error isolation (Task #4612): a throw here must not stop the
      // periodic flush loop nor the other tracking loops.
      try { if (!stats.isPausedRef.current) flushPoints(); }
      catch (e) { logGpsError(e, "tracking_tick_flush"); }
    }, 15000);
    refs.gpsHeartbeatTimerRef.current = setInterval(() => {
      // Per-tick error isolation (Task #4612): a throw here must not stop the
      // GPS blackout heartbeat nor the other tracking loops.
      try {
        if (stats.isPausedRef.current) return;
        const now = Date.now(), last = gps.lastGpsEventMsRef.current || stats.startTimeRef.current, lost = now - last > 15000;
        if (lost && !gps.gpsWasLostRef.current) { gps.gpsWasLostRef.current = true; gps.gpsBlackoutCountRef.current += 1; gps.gpsBlackoutStartRef.current = now; }
        else if (!lost && gps.gpsWasLostRef.current) { gps.gpsWasLostRef.current = false; if (gps.gpsBlackoutStartRef.current != null) { gps.gpsBlackoutSecondsRef.current += now - gps.gpsBlackoutStartRef.current; gps.gpsBlackoutStartRef.current = null; } }
        gps.setGpsLost(lost);
      } catch (e) { logGpsError(e, "tracking_tick_gps_heartbeat"); }
    }, 5000);
    // Fusion timer (Task #4560): runs at a fixed 1Hz cadence independent of the GPS
    // fix rate. Maintains the dead-reckoning speed estimate + divergence check,
    // publishes the observable fusion mode, and — when GPS is stale — keeps recording
    // distance + telemetry from sensors alone.
    refs.lastFusionTickRef.current = Date.now();
    refs.fusionTimerRef.current = setInterval(() => {
      // Per-tick error isolation (Task #4612): the fusion loop drives the
      // dead-reckoning estimate, the observable fusion mode AND the sensors-only
      // distance/telemetry recording. A transient throw here must NOT stop the
      // loop (which would silently halt distance recording during a GPS
      // blackout) — log it and let the next 1 Hz tick recover.
      try {
        if (stats.isPausedRef.current || session.phaseRef.current !== "active") return;
        const now = Date.now();
        const dt = Math.min(Math.max((now - refs.lastFusionTickRef.current) / 1000, 0.001), 5);
        refs.lastFusionTickRef.current = now;

        const lastFix = gps.lastUsableFixMsRef.current || 0;
        const gpsFresh = gps.gpsFixAcquiredRef.current && lastFix > 0 && now - lastFix < TRACKING_FUSION.GPS_STALE_MS;
        const sensorsActive = settings.sensorsEnabledRef.current && sensors.sensorSourceRef.current !== "none";

        // Integrate gravity-compensated linear forward acceleration (m/s²) → km/h.
        const linAccel = sensors.linearAccelFwdRef.current || 0;
        let dr = gps.drSpeedKmhRef.current + linAccel * dt * 3.6;
        // Bleed speed toward zero while coasting (no measured accel) so integration
        // drift can't keep phantom speed alive through a long blackout.
        if (linAccel === 0) dr *= 0.95;
        if (dr < 0) dr = 0;
        if (dr > TRACKING_FUSION.MAX_PLAUSIBLE_KMH) dr = TRACKING_FUSION.MAX_PLAUSIBLE_KMH;
        if (gpsFresh) {
          const gpsSpeed = gps.emaSpeedRef.current;
          if (Math.abs(dr - gpsSpeed) > TRACKING_FUSION.DIVERGENCE_KMH) gps.divergenceCountRef.current += 1;
          else gps.divergenceCountRef.current = 0;
          dr = gpsSpeed; // GPS is authoritative whenever a fresh fix exists
        }
        gps.drSpeedKmhRef.current = dr;
        const divergent = gps.divergenceCountRef.current >= TRACKING_FUSION.DIVERGENCE_SAMPLES;

        let mode: FusionMode;
        if (!gps.gpsFixAcquiredRef.current) {
          // No usable GPS fix yet. Once the startup grace elapses, fall back to
          // sensors-only so a cold/absent GPS start still records distance; until
          // then keep showing "acquiring".
          const elapsed = now - (stats.startTimeRef.current || now);
          mode = sensorsActive && elapsed > TRACKING_FUSION.ACQUIRING_GRACE_MS ? "sensors_only" : "acquiring";
        } else if (gpsFresh) mode = sensorsActive && !divergent ? "gps_sensors" : "gps_only";
        else mode = sensorsActive ? "sensors_only" : "gps_only";
        if (gps.fusionModeRef.current !== mode) { gps.fusionModeRef.current = mode; gps.setFusionMode(mode); }

        if (mode === "sensors_only") {
          // Raw dead-reckoning step, before the learned correction (Task #47).
          const rawDistKm = (dr / 3600) * dt;
          // Apply the per-user DR correction model (identity=1 until learned) to the
          // distance that feeds the LIVE total. The gap stays RAW: it both blocks the
          // bridging segment on recovery and is the ground truth the correction model
          // learns from, so scaling it would corrupt the learning loop. The server's
          // stop handler saves the client totalDistanceKm, so live == saved (no drift).
          const distanceScale = refs.drCorrectionRef?.current?.distanceScale ?? 1;
          const distKm = rawDistKm * distanceScale;
          if (rawDistKm > 0) {
            gps.totalKmRef.current += distKm; gps.setTotalKm(gps.totalKmRef.current);
            gps.drGapKmRef.current += rawDistKm; // RAW — reconciled by onNativeLocation on GPS recovery
          }
          // Dead-reckon an ESTIMATED position from the frozen GPS anchor using the
          // compass heading + travelled distance (Task #4705). The GPS anchor
          // (gps.lastPosRef) stays frozen so GPS-recovery reconciliation in
          // onNativeLocation is unaffected; we advance only our own drEstPosRef.
          const heading = refs.headingRef.current;
          let estLat: number | null = null, estLon: number | null = null;
          const base = refs.drEstPosRef.current ?? (gps.lastPosRef.current
            ? { lat: gps.lastPosRef.current.lat, lon: gps.lastPosRef.current.lng }
            : null);
          if (base && distKm > 0 && typeof heading === "number") {
            const next = computeDestinationPoint(base.lat, base.lon, distKm, heading);
            refs.drEstPosRef.current = { lat: next.lat, lon: next.lng };
            estLat = next.lat; estLon = next.lng;
          } else if (base) {
            refs.drEstPosRef.current = base;
            estLat = base.lat; estLon = base.lon;
          }
          refs.telemetryAccumRef.current.push({
            timestamp: new Date(now).toISOString(), lat: estLat ?? 0, lon: estLon ?? 0,
            leanAngle: sensors.currentTiltDegRef.current, gForceX: sensors.currentAccelGRef.current,
            speedKmh: dr, mode, estimated: estLat !== null,
          });
        } else {
          // GPS authoritative (or acquiring): drop any stale DR estimate so the next
          // blackout re-seeds from the current frozen anchor, not an old chain.
          refs.drEstPosRef.current = null;
        }
      } catch (e) { logGpsError(e, "tracking_tick_fusion"); }
    }, 1000);

    const p = settings.profileRef.current;
    const accuracy = p === "easy" ? Location.Accuracy.Balanced : p === "medium" ? Location.Accuracy.High : Location.Accuracy.BestForNavigation;
    const timeInterval = p === "easy" ? 2000 : p === "medium" ? 1000 : 500, distanceInterval = p === "easy" ? 5 : p === "medium" ? 2 : 0;

    // Fast start: seed an immediate reference so km move within seconds instead of
    // waiting for the first high-accuracy watch fix. Last-known seeds the display; a
    // quick Balanced fix seeds the distance reference; the watch accumulates from there.
    Location.getLastKnownPositionAsync()
      .then((loc) => { if (loc && session.phaseRef.current === "active" && !gps.lastPosRef.current) gps.setCurrentCoord({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }); })
      .catch(() => {});
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((loc) => { if (session.phaseRef.current === "active") onNativeLocation(loc); })
      .catch(() => {});

    // Progressive watch: bootstrap at Balanced for a fast first fix, then upgrade to
    // the profile's target accuracy once GPS is flowing.
    const startWatch = async (acc: Location.Accuracy, ti: number, di: number) => {
      if (refs.watchSubRef.current) { refs.watchSubRef.current.remove(); refs.watchSubRef.current = null; }
      refs.watchSubRef.current = await Location.watchPositionAsync({ accuracy: acc, timeInterval: ti, distanceInterval: di }, (loc) => onNativeLocation(loc));
    };
    try { await startWatch(Location.Accuracy.Balanced, 1000, 0); }
    catch (e) { logGpsError(e, "watchPositionAsync"); Alert.alert(t("common.error"), t("tracking.gpsStartError")); cleanupTracking(); session.setPhase("idle"); return; }
    refs.watchUpgradeTimeoutRef.current = setTimeout(() => {
      if (session.phaseRef.current === "active") startWatch(accuracy, timeInterval, distanceInterval).catch((e) => logGpsError(e, "watchPositionAsync/upgrade"));
    }, 5000);
    startDeviceMotionRef.current(); setTrackingActive(true); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [cleanupTracking, flushPoints, t, gps, sensors, battery, session, stats, settings, refs, onNativeLocation]);

  const { startDeviceMotion, discardSprintAttempt, handleStart, handleStop, handlePause, handleRecalibrate } =
    useTrackingHandlers({
      t, gps, sensors, sprint, battery, bg, session, stats, settings, mapState, refs, offlineQueue,
      handsOffActive, setHandsOffActive, setVolumeUI, refetchRecords,
      flushPoints, beginActiveTracking, resetTrackingState, cleanupTracking,
      requestBackgroundPermission,
    });

  // Wire startDeviceMotionRef now that startDeviceMotion is declared
  startDeviceMotionRef.current = startDeviceMotion;

  // Keep volume-button callback pointing at the latest handlePause
  volumeButtonCallbackRef.current = handlePause;

  useTrackingEffects({
    t, gps, sensors, sprint, bg, session, stats, settings, refs,
    handsOffActive, setHandsOffActive, setVolumeUI, isTabFocused, isTabFocusedRef,
    totalGpsPointsRef, lastLowAccuracyTelemetryRef, handsOffDismissedForRideRef, onNativeLocation,
    requestBackgroundPermission,
  });

  return {
    state: {
      profile: settings.profile, countdownEnabled: settings.countdownEnabled, countdownSec: settings.countdownSec,
      handsOffEnabled: settings.handsOffEnabled, handsOffSpeedStr: settings.handsOffSpeedStr,
      is0100Enabled: settings.is0100Enabled, showMyRoute: settings.showMyRoute, sensorsEnabled: settings.sensorsEnabled,
      showMountCalibWizard: settings.showMountCalibWizard, mountAxisCalib: sensors.mountAxisCalib,
      phase: session.phase, handsOffActive, loading: session.loading, summaryVisible: session.summaryVisible,
      summaryPatchFailed: session.summaryPatchFailed, mapModalVisible: mapState.mapModalVisible,
      summaryRoutePoints: mapState.summaryRoutePoints, routeMapVisible: mapState.routeMapVisible,
      publishRecord: session.publishRecord, publishCaption: session.publishCaption,
      recoveredRecords: session.recoveredRecords, rideTitle: session.rideTitle, completedRouteId: session.completedRouteId,
      histMapVisible: mapState.histMapVisible, histMapPoints: mapState.histMapPoints,
      histMapRecord: mapState.histMapRecord, histMapLoading: mapState.histMapLoading,
      currentSpeed: gps.currentSpeed, gpsAccuracy: gps.gpsAccuracy, gpsLost: gps.gpsLost,
      gpsFixAcquired: gps.gpsFixAcquired, fusionMode: gps.fusionMode,
      totalKm: gps.totalKm, maxSpeed: gps.maxSpeed, maxAltitude: gps.maxAltitude,
      mapCoords: gps.mapCoords, currentCoord: gps.currentCoord,
      gpsBlackoutCount: gps.gpsBlackoutCountRef.current,
      gpsBlackoutSeconds: Math.floor(gps.gpsBlackoutSecondsRef.current / 1000),
      totalMs: stats.totalMs, displayIdleMs: stats.displayIdleMs,
      currentG: sensors.currentG, currentLateralG: sensors.currentLateralG, currentTiltDeg: sensors.currentTiltDeg,
      maxAccelG: sensors.maxAccelG, maxDecelG: sensors.maxDecelG, maxLateralG: sensors.maxLateralG, maxTiltDeg: sensors.maxTiltDeg,
      isCalibrating: sensors.isCalibrating, showSensorOverlay: sensors.showSensorOverlay,
      countdownValue: session.countdownValue, countdownAnim: session.countdownAnim,
      sprintPhase: sprint.sprintPhase, sprintGoFired: sprint.sprintGoFired, sprint0to100Ms: sprint.sprint0to100Ms,
      isNewRecord: sprint.isNewRecord, recordAnim: sprint.recordAnim, personalBestMs: sprint.personalBestMsRef.current,
      pointsSent: stats.pointsSent, pointsBuffered: stats.pointsBuffered,
      batteryDrainStats: battery.batteryDrainStats, showBatteryStats: battery.showBatteryStats,
      debugLogs, debugVisible, bgToastCount: bg.bgToastCount, bgToastVisible: bg.bgToastVisible, bgToastAnim: bg.bgToastAnim,
      records, phoneSensorsAdminEnabled, isPending: session.isPublishPending, speedUnit, distanceUnit,
      mapsEnabled, resolvedProvider,
      offlineQueuePendingCount: offlineQueue.pendingCount, offlineQueueLastSyncedCount: offlineQueue.lastSyncedCount,
    },
    handlers: {
      setProfile: settings.setProfile, setCountdownEnabled: settings.setCountdownEnabled,
      setCountdownSec: settings.setCountdownSec, setHandsOffEnabled: settings.setHandsOffEnabled,
      setHandsOffSpeedStr: settings.setHandsOffSpeedStr, setIs0100Enabled: settings.setIs0100Enabled,
      setShowMyRoute: settings.setShowMyRoute, setShowMountCalibWizard: settings.setShowMountCalibWizard,
      setMountAxisCalib: sensors.setMountAxisCalib, setPhase: session.setPhase, setLoading: session.setLoading,
      setSummaryVisible: session.setSummaryVisible, setMapModalVisible: mapState.setMapModalVisible,
      setRouteMapVisible: mapState.setRouteMapVisible, setPublishRecord: session.setPublishRecord,
      setPublishCaption: session.setPublishCaption, setRideTitle: session.setRideTitle,
      setHistMapVisible: mapState.setHistMapVisible, setShowSensorOverlay: sensors.setShowSensorOverlay,
      setShowBatteryStats: battery.setShowBatteryStats, setDebugVisible, handleDebugTap, clearDebugLogs,
      handleStart, handleStop, handlePause, handleRecalibrate,
      handleDeleteRecord: (id: string) => stats.handleDeleteRecord(id, refetchRecords),
      handleViewHistoricalRoute: mapState.handleViewHistoricalRoute,
      handleExportGpx: mapState.handleExportGpx, handlePublish: session.handlePublish,
      discardSprintAttempt, refetchRecords,
      enqueueOfflinePatch: offlineQueue.enqueue, clearOfflineLastSynced: offlineQueue.clearLastSyncedCount,
      handleSaveVoiceNote: async (note: string): Promise<boolean> => {
        const rId = refs.routeIdRef.current;
        if (!rId) return false;
        try { await apiRequest("POST", `/api/routes/${rId}/voice-notes`, { text: note.slice(0, 2000) }); return true; }
        catch { return false; }
      },
    },
    avgSpeedDisplayKmh: stats.avgSpeedDisplayKmh,
  };
}
