import { useRef, useCallback, useState, useEffect } from "react";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import { apiRequest } from "@/lib/query-client";
import type { TelemetrySample } from "./useTelemetry";

export type LapState = "idle" | "recording" | "ready_to_save" | "saved";

function calcLeanAngle(x: number, z: number): number {
  return (Math.atan2(x, Math.abs(z)) * 180) / Math.PI;
}

export function useIdealLapRecorder(lapIndex: number) {
  const [lapState, setLapState] = useState<LapState>("idle");
  const [sampleCount, setSampleCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const bufferRef = useRef<TelemetrySample[]>([]);
  const accelRef = useRef({ x: 0, y: 0, z: 1 });
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const activeRef = useRef(false);

  const start = useCallback(async () => {
    if (activeRef.current) return;

    const sessionId = `ideal_lap_${lapIndex}_${Date.now()}`;
    sessionIdRef.current = sessionId;
    bufferRef.current = [];
    activeRef.current = true;
    setLapState("recording");
    setSampleCount(0);

    Accelerometer.setUpdateInterval(1000);
    accelSubRef.current = Accelerometer.addListener((data) => {
      accelRef.current = data;
    });

    try {
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (loc) => {
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

          bufferRef.current.push(sample);
          setSampleCount(bufferRef.current.length);
        }
      );
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
  }, [lapIndex]);

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

  const save = useCallback(async (): Promise<void> => {
    const sessionId = sessionIdRef.current;
    const samples = [...bufferRef.current];
    if (!sessionId || samples.length === 0) return;

    setSaving(true);
    try {
      await apiRequest("POST", "/api/telemetry/batch", {
        session_id: sessionId,
        session_type: "ideal_lap",
        samples,
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

  return { lapState, sampleCount, saving, start, stop, save, resetSlot };
}
