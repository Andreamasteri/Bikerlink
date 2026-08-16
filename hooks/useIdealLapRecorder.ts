import { useRef, useCallback, useState, useEffect } from "react";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import { apiRequest } from "@/lib/query-client";
import { locationSessionManager } from "@/lib/location-session-manager";
import type { TelemetrySample } from "./useTelemetry";

export type LapState = "idle" | "recording" | "ready_to_save" | "saved";

function calcLeanAngle(x: number, z: number): number {
  return (Math.atan2(x, Math.abs(z)) * 180) / Math.PI;
}

// Distanza Haversine (km) tra due punti GPS.
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function useIdealLapRecorder(lapIndex: number, targetKm?: number) {
  const [lapState, setLapState] = useState<LapState>("idle");
  const [sampleCount, setSampleCount] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [saving, setSaving] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const bufferRef = useRef<TelemetrySample[]>([]);
  const accelRef = useRef({ x: 0, y: 0, z: 1 });
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const activeRef = useRef(false);
  const distanceRef = useRef(0);
  const lastPointRef = useRef<{ lat: number; lon: number } | null>(null);
  const stopRef = useRef<() => void>(() => {});

  const start = useCallback(async () => {
    if (activeRef.current) return;

    const sessionId = `ideal_lap_${lapIndex}_${Date.now()}`;
    sessionIdRef.current = sessionId;
    bufferRef.current = [];
    activeRef.current = true;
    distanceRef.current = 0;
    lastPointRef.current = null;
    setLapState("recording");
    setSampleCount(0);
    setDistanceKm(0);

    Accelerometer.setUpdateInterval(1000);
    accelSubRef.current = Accelerometer.addListener((data) => {
      accelRef.current = data;
    });

    try {
      const sub = locationSessionManager.subscribe((loc) => {
          if (!activeRef.current) return;
          const { latitude, longitude, altitude, speed, heading } = loc.coords;
          const accel = accelRef.current;

          const sample: TelemetrySample = {
            ts: loc.timestamp,
            lat: latitude,
            lon: longitude,
          };
          if (speed != null && speed >= 0) sample.speed_kmh = speed * 3.6;
          if (altitude != null) sample.altitude_m = altitude;
          if (heading != null && heading >= 0) sample.heading = heading;
          sample.gforce_x = accel.x;
          sample.gforce_y = accel.y;
          sample.gforce_z = accel.z;
          sample.lean_angle = calcLeanAngle(accel.x, accel.z);

          const last = lastPointRef.current;
          if (last) {
            const seg = haversineKm(last.lat, last.lon, latitude, longitude);
            if (Number.isFinite(seg) && seg < 5) {
              distanceRef.current += seg;
              setDistanceKm(distanceRef.current);
            }
          }
          lastPointRef.current = { lat: latitude, lon: longitude };

          bufferRef.current.push(sample);
          setSampleCount(bufferRef.current.length);

          // Auto-stop al raggiungimento del target km.
          if (
            targetKm != null &&
            targetKm > 0 &&
            distanceRef.current >= targetKm
          ) {
            stopRef.current();
          }
        }, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
        });
      locationSubRef.current = sub;
    } catch (err) {
      console.warn("[useIdealLapRecorder] location subscription failed", err);
      activeRef.current = false;
      if (accelSubRef.current) {
        accelSubRef.current.remove();
        accelSubRef.current = null;
      }
      setLapState("idle");
    }
  }, [lapIndex, targetKm]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;

    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }

    setLapState(bufferRef.current.length > 0 ? "ready_to_save" : "idle");
  }, []);

  stopRef.current = stop;

  const save = useCallback(async (lapName?: string): Promise<void> => {
    const sessionId = sessionIdRef.current;
    const samples = [...bufferRef.current];
    if (!sessionId || samples.length === 0) return;

    const trimmed = lapName?.trim();
    setSaving(true);
    try {
      await apiRequest("POST", "/api/telemetry/batch", {
        session_id: sessionId,
        session_type: "ideal_lap",
        samples,
        ...(trimmed ? { lap_name: trimmed } : {}),
      });
      bufferRef.current = [];
      setSampleCount(0);
      setLapState("saved");
    } catch (err) {
      console.warn("[useIdealLapRecorder] save failed", err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const resetSlot = useCallback(() => {
    activeRef.current = false;
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }
    bufferRef.current = [];
    sessionIdRef.current = null;
    setSampleCount(0);
    setLapState("idle");
  }, []);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
      if (accelSubRef.current) {
        accelSubRef.current.remove();
        accelSubRef.current = null;
      }
    };
  }, []);

  return { lapState, sampleCount, distanceKm, saving, start, stop, save, resetSlot };
}
