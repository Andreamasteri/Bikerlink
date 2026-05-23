import { useState, useRef } from "react";

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
  };
}
