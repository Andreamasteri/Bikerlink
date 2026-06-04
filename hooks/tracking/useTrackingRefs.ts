import { useRef, useCallback } from "react";
import * as Location from "expo-location";
import { logGpsError } from "@/lib/gps-logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GpsPoint } from "../../components/tracking/useGpsTracking";

const GPS_BUFFER_SEGCOUNT_KEY = "@bikerlink/gps_buffer_segcount";
const GPS_BUFFER_SEG_KEY = (n: number) => `@bikerlink/gps_buffer_seg_${n}`;
const GPS_BUFFER_WRITE_EVERY = 5;
const GPS_BUFFER_MAX_SEGMENTS = 50;

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
          const writeSlot = n % GPS_BUFFER_MAX_SEGMENTS;
          const newN = Math.min(n + 1, GPS_BUFFER_MAX_SEGMENTS);
          await AsyncStorage.setItem(GPS_BUFFER_SEG_KEY(writeSlot), JSON.stringify(pointsToWrite));
          await AsyncStorage.setItem(GPS_BUFFER_SEGCOUNT_KEY, newN.toString());
        } catch (e: unknown) {
          const isFull =
            e != null &&
            typeof e === "object" &&
            (("code" in e && (e as { code: unknown }).code === 13) ||
              ("message" in e &&
                typeof (e as { message: unknown }).message === "string" &&
                (e as { message: string }).message.includes("SQLITE_FULL")));
          if (isFull) {
            try {
              const rawN = await AsyncStorage.getItem(GPS_BUFFER_SEGCOUNT_KEY);
              const curN = rawN ? Math.min(parseInt(rawN, 10), GPS_BUFFER_MAX_SEGMENTS) : 0;
              await AsyncStorage.multiRemove([
                GPS_BUFFER_SEGCOUNT_KEY,
                ...Array.from({ length: curN }, (_, i) => GPS_BUFFER_SEG_KEY(i)),
              ]);
              await AsyncStorage.setItem(GPS_BUFFER_SEG_KEY(0), JSON.stringify(pointsToWrite));
              await AsyncStorage.setItem(GPS_BUFFER_SEGCOUNT_KEY, "1");
            } catch {
              logGpsError(e, "appendPointToOfflineBuffer:SQLITE_FULL");
            }
          } else {
            logGpsError(e, "appendPointToOfflineBuffer");
          }
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
