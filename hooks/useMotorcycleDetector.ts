import { useState, useEffect, useRef, useCallback } from "react";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import {
  loadMountCalibration,
  type MountAxisCalibration,
} from "@/components/MountCalibWizard";

// ─── Thresholds (per task spec) ───────────────────────────────────────────────
const SPEED_START_KMH = 20;      // speed must stay above this to trigger start
const SPEED_STOP_KMH  = 15;      // speed must stay below this to trigger stop
const START_DURATION_MS = 3000;  // speed > 20 km/h for ≥3s continuous
const STOP_DURATION_MS  = 60000; // speed < 15 km/h for >60s continuous (strictly greater)
const GPS_INTERVAL_MS   = 2000;
const ACCEL_INTERVAL_MS = 2000;

// ─── Mount orientation check ──────────────────────────────────────────────────
// The calibrated vertAxis should carry the majority of the gravity signal when
// the phone is seated in the mount.  We require it to contribute at least 50%
// of the total absolute acceleration.  Generous tolerance to survive vibration.
const VERT_AXIS_MIN_FRACTION = 0.50;

function isInMountOrientation(
  accel: { x: number; y: number; z: number },
  calib: MountAxisCalibration
): boolean {
  const absX = Math.abs(accel.x);
  const absY = Math.abs(accel.y);
  const absZ = Math.abs(accel.z);
  const total = absX + absY + absZ;
  if (total < 0.3) return false; // no meaningful reading (near free-fall or zeroed)
  const vertVal = calib.vertAxis === "x" ? absX : calib.vertAxis === "y" ? absY : absZ;
  return vertVal / total >= VERT_AXIS_MIN_FRACTION;
}

interface Options { enabled: boolean }

export function useMotorcycleDetector({ enabled }: Options): { isRiding: boolean } {
  const [isRiding, setIsRiding] = useState(false);

  const isRidingRef          = useRef(false);
  const calibRef             = useRef<MountAxisCalibration | null>(null);
  const accelRef             = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const aboveStartAtRef      = useRef<number | null>(null); // timestamp when speed first exceeded 20 km/h
  const belowStopAtRef       = useRef<number | null>(null); // timestamp when speed first dropped below 15 km/h

  const locationSubRef       = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef          = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);

  const resetTimers = useCallback(() => {
    aboveStartAtRef.current = null;
    belowStopAtRef.current  = null;
  }, []);

  const cleanup = useCallback(() => {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    accelSubRef.current?.remove();
    accelSubRef.current = null;
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      if (isRidingRef.current) {
        isRidingRef.current = false;
        setIsRiding(false);
      }
      return;
    }

    let cancelled = false;

    (async () => {
      // Load calibration first — required for orientation check
      const calib = await loadMountCalibration();
      if (cancelled) return;
      calibRef.current = calib;

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;

      // Accelerometer at 2 Hz — keeps latest reading for orientation check
      Accelerometer.setUpdateInterval(ACCEL_INTERVAL_MS);
      accelSubRef.current = Accelerometer.addListener((data) => {
        accelRef.current = data;
      });

      // GPS at 2 Hz — primary speed signal
      const sub = await Location.watchPositionAsync(
        {
          accuracy:         Location.Accuracy.Balanced,
          timeInterval:     GPS_INTERVAL_MS,
          distanceInterval: 5,
        },
        (loc) => {
          if (cancelled) return;
          const now       = Date.now();
          const rawSpeed  = loc.coords.speed ?? 0;
          const speedKmh  = Math.max(0, rawSpeed * 3.6);
          const calib     = calibRef.current;
          const inMount   = calib ? isInMountOrientation(accelRef.current, calib) : true;
          // ^^^ fallback true when no calib stored (should not happen — provider
          //     disables when uncalibrated, but defensive default)

          if (!isRidingRef.current) {
            // ── Waiting to start ──────────────────────────────────────────────
            if (speedKmh > SPEED_START_KMH && inMount) {
              if (aboveStartAtRef.current === null) {
                aboveStartAtRef.current = now;
              } else if (now - aboveStartAtRef.current >= START_DURATION_MS) {
                isRidingRef.current     = true;
                setIsRiding(true);
                aboveStartAtRef.current = null;
                belowStopAtRef.current  = null;
              }
            } else {
              // Reset if speed drops or phone leaves mount
              aboveStartAtRef.current = null;
            }
          } else {
            // ── Already riding — watch for stop ───────────────────────────────
            if (speedKmh < SPEED_STOP_KMH) {
              if (belowStopAtRef.current === null) {
                belowStopAtRef.current = now;
              } else if (now - belowStopAtRef.current > STOP_DURATION_MS) {
                // Strictly >60s (task spec says ">60s consecutive")
                isRidingRef.current    = false;
                setIsRiding(false);
                belowStopAtRef.current = null;
                aboveStartAtRef.current = null;
              }
            } else {
              // Speed recovered (brief stop / traffic light) — reset stop timer
              belowStopAtRef.current = null;
            }
          }
        }
      );

      if (cancelled) {
        sub.remove();
        accelSubRef.current?.remove();
        accelSubRef.current = null;
      } else {
        locationSubRef.current = sub;
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
      if (isRidingRef.current) {
        isRidingRef.current = false;
        setIsRiding(false);
      }
    };
  }, [enabled, cleanup]);

  return { isRiding };
}
