import { useRef, useCallback } from "react";
import * as Location from "expo-location";
import { logGpsError } from "@/lib/gps-logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GpsPoint } from "../../components/tracking/useGpsTracking";

const GPS_BUFFER_SEGCOUNT_KEY = "@bikerlink/gps_buffer_segcount";
const GPS_BUFFER_SEG_KEY = (n: number) => `@bikerlink/gps_buffer_seg_${n}`;
const GPS_BUFFER_WRITE_EVERY = 5;

export function useTrackingRefs() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsHeartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<{ remove: () => void } | null>(null);
  const routeIdRef = useRef<string | null>(null);
  const countdownTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownGoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New shared refs moved from useTrackingState
  const gpsOfflineBufferRef = useRef<GpsPoint[]>([]);
  const gpsOfflineWriteCountRef = useRef(0);
  const bufferWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  
  const pointsBufferRef = useRef<GpsPoint[]>([]);
  const telemetryAccumRef = useRef<Array<{
    timestamp: string;
    lat: number;
    lon: number;
    leanAngle?: number;
    gForceX?: number;
    speedKmh?: number;
  }>>([]);

  const appendPointToOfflineBuffer = useCallback((point: GpsPoint) => {
    gpsOfflineBufferRef.current.push(point);
    gpsOfflineWriteCountRef.current += 1;
    if (gpsOfflineWriteCountRef.current >= GPS_BUFFER_WRITE_EVERY) {
      gpsOfflineWriteCountRef.current = 0;
      const pointsToWrite = [...gpsOfflineBufferRef.current];
      bufferWriteQueueRef.current = bufferWriteQueueRef.current.then(async () => {
        try {
          const rawN = await AsyncStorage.getItem(GPS_BUFFER_SEGCOUNT_KEY);
          const n = rawN ? parseInt(rawN, 10) : 0;
          await AsyncStorage.setItem(GPS_BUFFER_SEG_KEY(n), JSON.stringify(pointsToWrite));
          await AsyncStorage.setItem(GPS_BUFFER_SEGCOUNT_KEY, (n + 1).toString());
        } catch (e) {
          logGpsError(e, "appendPointToOfflineBuffer");
        }
      });
    }
  }, []);

  return {
    timerRef,
    flushTimerRef,
    gpsHeartbeatTimerRef,
    watchSubRef,
    accelSubRef,
    routeIdRef,
    countdownTickRef,
    countdownGoTimeoutRef,
    gpsOfflineBufferRef,
    gpsOfflineWriteCountRef,
    bufferWriteQueueRef,
    pointsBufferRef,
    telemetryAccumRef,
    appendPointToOfflineBuffer,
  };
}
