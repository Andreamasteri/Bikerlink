import { useState, useRef, useEffect } from "react";
import { emitMapsTelemetry } from "@/hooks/useMapTelemetry";
import type { FusionMode } from "@shared/tracking-fusion";

export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  speedKmh: number;
  timestamp: string;
  accelG?: number;
  tiltDeg?: number;
}

export function useGpsTracking() {
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsLost, setGpsLost] = useState(false);
  const [totalKm, setTotalKm] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [maxAltitude, setMaxAltitude] = useState(0);
  const [mapCoords, setMapCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [currentCoord, setCurrentCoord] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  // Task #4560 — true once the first usable GPS fix is processed; drives the
  // "acquiring GPS" UI so the rider knows km will start once the lock lands.
  const [gpsFixAcquired, setGpsFixAcquired] = useState(false);
  // Observable sensor+GPS fusion mode (acquiring/gps_sensors/gps_only/sensors_only).
  const [fusionMode, setFusionMode] = useState<FusionMode>("acquiring");

  const totalKmRef = useRef(0);
  const maxSpeedRef = useRef(0);
  const maxAltRef = useRef(0);
  const mapCoordsRef = useRef<Array<{ latitude: number; longitude: number }>>([]);
  const lastPosRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const gpsWasLostRef = useRef(false);
  const gpsBlackoutCountRef = useRef(0);
  const gpsBlackoutSecondsRef = useRef(0);
  const gpsBlackoutStartRef = useRef<number | null>(null);
  const emaSpeedRef = useRef<number>(0);
  // Task #4560 — fusion/dead-reckoning refs (read from timers, no re-render).
  const gpsFixAcquiredRef = useRef(false);
  const fusionModeRef = useRef<FusionMode>("acquiring");
  const lastAccuracyRef = useRef<number | null>(null);
  // Timestamp (ms) of the last RAW GPS callback (any quality). Drives blackout
  // detection only — "are callbacks still arriving at all?".
  const lastGpsEventMsRef = useRef(0);
  // Timestamp (ms) of the last USABLE (accuracy-gated) GPS fix. Drives fusion
  // freshness — a stream of rejected low-accuracy fixes must NOT keep GPS "fresh",
  // or sensors-only fallback never engages.
  const lastUsableFixMsRef = useRef(0);
  // Dead-reckoning speed estimate (km/h): tracks GPS when fresh, integrates accel
  // when GPS is stale so recording can continue from sensors alone.
  const drSpeedKmhRef = useRef(0);
  // Distance (km) added by dead reckoning during the current GPS blackout; used to
  // skip the bridging GPS segment on recovery so the gap isn't counted twice.
  const drGapKmRef = useRef(0);
  // Consecutive samples where the sensor estimate diverges markedly from GPS.
  const divergenceCountRef = useRef(0);

  // Task #2686 — telemetria GPS: emette gps_acquire/gps_lost SOLO sulle transizioni
  // di stato e throttla gps_low_accuracy a 60s per evitare spam di rete.
  const lastGpsStateRef = useRef<boolean | null>(null);
  const lastLowAccuracyEmitRef = useRef<number>(0);
  useEffect(() => {
    if (lastGpsStateRef.current === gpsLost) return;
    lastGpsStateRef.current = gpsLost;
    emitMapsTelemetry({
      event: gpsLost ? "gps_lost" : "gps_acquire",
      component: "useGpsTracking",
    });
  }, [gpsLost]);
  useEffect(() => {
    if (gpsAccuracy == null || gpsAccuracy <= 50) return;
    const now = Date.now();
    if (now - lastLowAccuracyEmitRef.current < 60_000) return;
    lastLowAccuracyEmitRef.current = now;
    emitMapsTelemetry({
      event: "gps_low_accuracy",
      component: "useGpsTracking",
      details: { accuracy: gpsAccuracy },
    });
  }, [gpsAccuracy]);

  return {
    currentSpeed,
    setCurrentSpeed,
    gpsAccuracy,
    setGpsAccuracy,
    gpsLost,
    setGpsLost,
    totalKm,
    setTotalKm,
    maxSpeed,
    setMaxSpeed,
    maxAltitude,
    setMaxAltitude,
    mapCoords,
    setMapCoords,
    currentCoord,
    setCurrentCoord,
    gpsFixAcquired,
    setGpsFixAcquired,
    fusionMode,
    setFusionMode,
    totalKmRef,
    maxSpeedRef,
    maxAltRef,
    mapCoordsRef,
    lastPosRef,
    gpsWasLostRef,
    gpsBlackoutCountRef,
    gpsBlackoutSecondsRef,
    gpsBlackoutStartRef,
    emaSpeedRef,
    gpsFixAcquiredRef,
    fusionModeRef,
    lastAccuracyRef,
    lastGpsEventMsRef,
    lastUsableFixMsRef,
    drSpeedKmhRef,
    drGapKmRef,
    divergenceCountRef,
  };
}
