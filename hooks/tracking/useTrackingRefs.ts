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

  const pointsBufferRef = useRef<GpsPoint[]>([]);
  const telemetryAccumRef = useRef<Array<{
    timestamp: string;
    lat: number;
    lon: number;
    leanAngle?: number;
    gForceX?: number;
    speedKmh?: number;
    mode?: string;
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
    pointsBufferRef,
    telemetryAccumRef,
  };
}
