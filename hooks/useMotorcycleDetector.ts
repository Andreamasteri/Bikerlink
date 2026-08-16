import { useState, useEffect, useRef, useCallback } from "react";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadMountCalibration,
  type MountAxisCalibration,
} from "@/components/MountCalibWizard";
import { locationSessionManager } from "@/lib/location-session-manager";

export const RELAXED_MOUNT_MODE_KEY = "@bikerlink/relaxed_mount_mode";

export async function loadRelaxedMountMode(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(RELAXED_MOUNT_MODE_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export async function setRelaxedMountMode(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(RELAXED_MOUNT_MODE_KEY, enabled ? "true" : "false");
  } catch {
    // ignora errori storage
  }
}

// ─── Thresholds (per task spec) ───────────────────────────────────────────────
const SPEED_START_KMH = 20;      // speed must stay above this to trigger start
const SPEED_STOP_KMH  = 15;      // speed must stay below this to trigger stop
const START_DURATION_MS = 3000;  // speed > 20 km/h for ≥3s continuous
const STOP_DURATION_MS  = 60000; // speed < 15 km/h for >60s continuous (strictly greater)
const GPS_INTERVAL_MS   = 2000;
const ACCEL_INTERVAL_MS = 2000;

// ─── Accelerometer-only fallback (no GPS) ─────────────────────────────────────
// When GPS permission is denied or the location subscription fails we cannot use
// speed, so motion is inferred from accelerometer variance instead.
const FALLBACK_INTERVAL_MS              = 500;    // sample/eval rate while in fallback
const ACCEL_WINDOW                      = 6;      // ~3s of samples at 500 ms
const ACCEL_VARIANCE_THRESHOLD_G        = 0.3;    // mean |magnitude − mean| above this = motion
const FALLBACK_START_DURATION_MS        = 3000;   // sustained motion for ≥3s → riding
const FALLBACK_STOP_DURATION_MS         = 60000;  // sustained stillness for >60s → stopped

// Exported for unit tests — pure helpers that mirror the production logic exactly.
export const ACCEL_VARIANCE_THRESHOLD   = ACCEL_VARIANCE_THRESHOLD_G;
export const ACCEL_FALLBACK_WINDOW_SIZE = ACCEL_WINDOW;
export const ACCEL_FALLBACK_START_MS    = FALLBACK_START_DURATION_MS;
export const ACCEL_FALLBACK_STOP_MS     = FALLBACK_STOP_DURATION_MS;
export const ACCEL_FALLBACK_INTERVAL_MS = FALLBACK_INTERVAL_MS;

/**
 * Computes mean absolute deviation of magnitude values in the window.
 * Called by both startAccelFallback (production) and unit tests.
 * Returns 0 when the window has fewer than 2 entries (not enough data).
 */
export function computeAccelSpread(magWindow: number[]): number {
  if (magWindow.length < 2) return 0;
  const mean = magWindow.reduce((a, b) => a + b, 0) / magWindow.length;
  let spread = 0;
  for (const m of magWindow) spread += Math.abs(m - mean);
  return spread / magWindow.length;
}

/**
 * Pure state for the accelerometer-only fallback hysteresis machine.
 * Exported so tests can simulate the state machine tick-by-tick without
 * running a real setInterval or mounting the hook.
 */
export interface AccelFallbackState {
  isRiding:     boolean;
  aboveStartAt: number | null;
  belowStopAt:  number | null;
}

/**
 * Processes one timer tick of the accelerometer fallback state machine.
 * Returns the next state (immutable — does NOT mutate the input).
 * This is the exact transition logic used by startAccelFallback; both
 * production and tests share this single implementation.
 */
export function accelFallbackTick(
  state: AccelFallbackState,
  magWindow: number[],
  now: number,
): AccelFallbackState {
  const spread = computeAccelSpread(magWindow);
  const moving = magWindow.length >= 2 && spread > ACCEL_VARIANCE_THRESHOLD_G;
  const next: AccelFallbackState = { ...state };

  if (!state.isRiding) {
    if (moving) {
      if (state.aboveStartAt === null) {
        next.aboveStartAt = now;
      } else if (now - state.aboveStartAt >= FALLBACK_START_DURATION_MS) {
        next.isRiding     = true;
        next.aboveStartAt = null;
        next.belowStopAt  = null;
      }
    } else {
      next.aboveStartAt = null;
    }
  } else {
    if (!moving) {
      if (state.belowStopAt === null) {
        next.belowStopAt = now;
      } else if (now - state.belowStopAt > FALLBACK_STOP_DURATION_MS) {
        next.isRiding    = false;
        next.belowStopAt  = null;
        next.aboveStartAt = null;
      }
    } else {
      next.belowStopAt = null;
    }
  }

  return next;
}

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

interface Options { enabled: boolean; relaxedMode?: boolean }

export function useMotorcycleDetector({ enabled, relaxedMode = false }: Options): { isRiding: boolean } {
  const [isRiding, setIsRiding] = useState(false);

  const isRidingRef          = useRef(false);
  const calibRef             = useRef<MountAxisCalibration | null>(null);
  const relaxedRef           = useRef(relaxedMode);
  const accelRef             = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const aboveStartAtRef      = useRef<number | null>(null);
  const belowStopAtRef       = useRef<number | null>(null);

  const locationSubRef       = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef          = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const fallbackTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimers = useCallback(() => {
    aboveStartAtRef.current = null;
    belowStopAtRef.current  = null;
  }, []);

  const cleanup = useCallback(() => {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    accelSubRef.current?.remove();
    accelSubRef.current = null;
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    resetTimers();
  }, [resetTimers]);

  // ── accelerometer-only motion detection (used when GPS is unavailable) ──────
  // Infers motion from the variance of the accelerometer magnitude: a still
  // phone reads a near-constant ~1g, while a moving motorcycle adds vibration
  // and acceleration that raise the spread. Reuses the same sustained-duration
  // start/stop hysteresis as the GPS path.
  const startAccelFallback = useCallback(() => {
    if (fallbackTimerRef.current) return; // already running
    // Faster accelerometer updates so the 500 ms variance window is meaningful.
    Accelerometer.setUpdateInterval(FALLBACK_INTERVAL_MS);
    const magWindow: number[] = [];
    resetTimers();

    fallbackTimerRef.current = setInterval(() => {
      const { x, y, z } = accelRef.current;
      const mag = Math.sqrt(x * x + y * y + z * z);
      magWindow.push(mag);
      if (magWindow.length > ACCEL_WINDOW) magWindow.shift();

      const now = Date.now();
      const prev: AccelFallbackState = {
        isRiding:     isRidingRef.current,
        aboveStartAt: aboveStartAtRef.current,
        belowStopAt:  belowStopAtRef.current,
      };
      const next = accelFallbackTick(prev, magWindow, now);

      // Apply mutations and emit React state change only on isRiding flip
      aboveStartAtRef.current = next.aboveStartAt;
      belowStopAtRef.current  = next.belowStopAt;
      if (next.isRiding !== isRidingRef.current) {
        isRidingRef.current = next.isRiding;
        setIsRiding(next.isRiding);
      }
    }, FALLBACK_INTERVAL_MS);
  }, [resetTimers]);

  // ── Sync relaxedRef whenever the prop changes (immediate, no restart needed) ─
  useEffect(() => {
    relaxedRef.current = relaxedMode;
  }, [relaxedMode]);

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
      // Carica la calibrazione (relaxedMode arriva dal prop, non da AsyncStorage)
      const calib = await loadMountCalibration();
      if (cancelled) return;
      calibRef.current = calib;

      // Accelerometer at 2 Hz — keeps latest reading for orientation check and
      // doubles as the source for the accelerometer-only fallback below.
      Accelerometer.setUpdateInterval(ACCEL_INTERVAL_MS);
      accelSubRef.current = Accelerometer.addListener((data) => {
        accelRef.current = data;
      });

      const { status } = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        // GPS permission denied → infer motion from accelerometer variance only.
        startAccelFallback();
        return;
      }

      // GPS at 2 Hz — primary speed signal
      let sub: Location.LocationSubscription;
      try {
        sub = locationSessionManager.subscribe((loc) => {
          if (cancelled) return;
          const now       = Date.now();
          const rawSpeed  = loc.coords.speed ?? 0;
          const speedKmh  = Math.max(0, rawSpeed * 3.6);
          const calib     = calibRef.current;
          // In modalità rilassata, il gate orientamento è sempre soddisfatto
          const inMount   = relaxedRef.current
            ? true
            : calib ? isInMountOrientation(accelRef.current, calib) : true;

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
              aboveStartAtRef.current = null;
            }
          } else {
            // ── Already riding — watch for stop ───────────────────────────────
            if (speedKmh < SPEED_STOP_KMH) {
              if (belowStopAtRef.current === null) {
                belowStopAtRef.current = now;
              } else if (now - belowStopAtRef.current > STOP_DURATION_MS) {
                isRidingRef.current    = false;
                setIsRiding(false);
                belowStopAtRef.current = null;
                aboveStartAtRef.current = null;
              }
            } else {
              belowStopAtRef.current = null;
            }
          }
        }, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: GPS_INTERVAL_MS,
          distanceInterval: 5,
        });
      } catch (err) {
        // GPS subscription failed → fall back to accelerometer-only detection.
        console.warn("[useMotorcycleDetector] GPS subscription failed, using accelerometer fallback", err);
        if (!cancelled) startAccelFallback();
        return;
      }

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
  }, [enabled, cleanup, startAccelFallback]);

  return { isRiding };
}
