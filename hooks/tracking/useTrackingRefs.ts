import { useRef } from "react";
import * as Location from "expo-location";
import { GpsPoint } from "../../components/tracking/useGpsTracking";

export function useTrackingRefs() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsHeartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<{ remove: () => void } | null>(null);
  const routeIdRef = useRef<string | null>(null);
  const countdownTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownGoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Task #4560 — fusion timer (1Hz sensor cadence) + progressive-watch upgrade.
  const fusionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchUpgradeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFusionTickRef = useRef<number>(0);

  // Compass heading (degrees, 0 = north, clockwise) sourced from DeviceMotion's
  // rotation.alpha — used as the travel direction for dead reckoning while GPS is
  // absent. null until the first DeviceMotion sample arrives.
  const headingRef = useRef<number | null>(null);
  // Chained dead-reckoning position estimate, advanced from the last GPS anchor
  // while in sensors_only mode. Kept SEPARATE from gps.lastPosRef so the GPS-
  // recovery reconciliation (which freezes the anchor during a blackout) is
  // unchanged. Reset to null whenever GPS is fresh again.
  const drEstPosRef = useRef<{ lat: number; lon: number } | null>(null);

  const pointsBufferRef = useRef<GpsPoint[]>([]);
  const telemetryAccumRef = useRef<Array<{
    timestamp: string;
    lat: number;
    lon: number;
    leanAngle?: number;
    gForceX?: number;
    speedKmh?: number;
    mode?: string;
    estimated?: boolean;
  }>>([]);

  return {
    timerRef,
    flushTimerRef,
    gpsHeartbeatTimerRef,
    watchSubRef,
    accelSubRef,
    routeIdRef,
    countdownTickRef,
    countdownGoTimeoutRef,
    fusionTimerRef,
    watchUpgradeTimeoutRef,
    lastFusionTickRef,
    headingRef,
    drEstPosRef,
    pointsBufferRef,
    telemetryAccumRef,
  };
}
