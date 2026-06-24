import React, { useState } from "react";
import * as Speech from "expo-speech";
import { haversineM } from "@/lib/geo";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import type { NavWeatherZone } from "@/components/navigate/NavigationWeather";

export function announceStep(distM: number, stepIdx: number, nextStep: any, announcedFar: Set<number>, announcedNear: Set<number>, t: any, locale: string) {
  if (distM <= 200 && !announcedFar.has(stepIdx)) {
    announcedFar.add(stepIdx);
    const streetPart = nextStep.streetName
      ? ` ${t("nav.announce.via").replace("{street}", nextStep.streetName)}`
      : "";
    const announcement = t("nav.announce.far")
      .replace("{distance}", String(Math.round(distM)))
      .replace("{instruction}", nextStep.text) + streetPart;
    Speech.speak(announcement, { language: locale });
  } else if (distM <= 50 && !announcedNear.has(stepIdx)) {
    announcedNear.add(stepIdx);
    Speech.speak(nextStep.text, { language: locale });
  }
}

export function calculateRemainingDist(polylinePoints: Array<[number, number]>, closestIdx: number): number {
  const remainingPts = polylinePoints.slice(closestIdx);
  let remDist = 0;
  for (let i = 1; i < remainingPts.length; i++) {
    remDist += haversineM(remainingPts[i-1][0], remainingPts[i-1][1], remainingPts[i][0], remainingPts[i][1]);
  }
  return remDist;
}

export const useVoiceCommandInternal = (
  whisper: any,
  setVoiceCmdToast: (val: string | null) => void,
  triggerRerouteToDestination: (lat: number, lon: number) => Promise<void>,
) => {
  const handleVoiceCommand = async () => {
    const text = await whisper.stopAndTranscribe();
    if (!text) {
      setVoiceCmdToast(whisper.error ?? "Trascrizione fallita");
      setTimeout(() => setVoiceCmdToast(null), 3000);
      return;
    }

    setVoiceCmdToast(`🎤 "${text}" — geocodifica...`);

    try {
      const geocodeUrl = new URL("/api/planned-routes/geocode", getApiUrl());
      geocodeUrl.searchParams.set("q", text);
      const geocodeRes = await apiRequest("GET", geocodeUrl.pathname + geocodeUrl.search);
      const results = await geocodeRes.json() as Array<{ lat: number; lon: number; display_name?: string }>;

      if (!Array.isArray(results) || results.length === 0) {
        setVoiceCmdToast("Destinazione non trovata");
        setTimeout(() => setVoiceCmdToast(null), 3000);
        return;
      }

      const { lat, lon } = results[0];
      setVoiceCmdToast(`Ricalcolo verso ${results[0].display_name ?? text}...`);
      await triggerRerouteToDestination(lat, lon);
      setTimeout(() => setVoiceCmdToast(null), 4000);
    } catch {
      setVoiceCmdToast("Errore geocodifica");
      setTimeout(() => setVoiceCmdToast(null), 3000);
    }
  };

  return { handleVoiceCommand };
};

export const useNavigateStates = () => {
  const [mapReady, setMapReady] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [distanceToNext, setDistanceToNext] = useState<number | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [remainingKm, setRemainingKm] = useState<number | null>(null);
  const [remainingMin, setRemainingMin] = useState<number | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [polylinePoints, setPolylinePoints] = useState<Array<[number, number]>>([]);
  const [hasPermission, setHasPermission] = useState(false);
  const [isRerouting, setIsRerouting] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [currentWeather, setCurrentWeather] = useState<NavWeatherZone | null>(null);
  const [aheadWeather, setAheadWeather] = useState<NavWeatherZone | null>(null);

  return {
    mapReady, setMapReady,
    currentStep, setCurrentStep,
    distanceToNext, setDistanceToNext,
    progressPct, setProgressPct,
    remainingKm, setRemainingKm,
    remainingMin, setRemainingMin,
    isFinished, setIsFinished,
    polylinePoints, setPolylinePoints,
    hasPermission, setHasPermission,
    isRerouting, setIsRerouting,
    isOffline, setIsOffline,
    weatherLoading, setWeatherLoading,
    currentWeather, setCurrentWeather,
    aheadWeather, setAheadWeather,
  };
};

export const useWeatherHandlers = (
  isFetchingWeatherRef: React.MutableRefObject<boolean>,
  lastWeatherFetchRef: React.MutableRefObject<number>,
  lastWeatherAheadPtRef: React.MutableRefObject<{ lat: number; lng: number } | null>,
  setWeatherLoading: (v: boolean) => void,
  setCurrentWeather: (v: NavWeatherZone | null) => void,
  setAheadWeather: (v: NavWeatherZone | null) => void,
  polylinePoints: Array<[number, number]>,
  WEATHER_AHEAD_KM: number,
  WEATHER_THROTTLE_MS: number,
  WEATHER_AHEAD_REFETCH_M: number,
) => {
  const fetchNavWeather = async (lat: number, lng: number, closestIdx: number) => {
    if (isFetchingWeatherRef.current || polylinePoints.length === 0) return;

    let aheadPt: [number, number] = polylinePoints[polylinePoints.length - 1];
    let acc = 0;
    for (let i = closestIdx + 1; i < polylinePoints.length; i++) {
      acc += haversineM(polylinePoints[i - 1][0], polylinePoints[i - 1][1], polylinePoints[i][0], polylinePoints[i][1]);
      if (acc >= WEATHER_AHEAD_KM * 1000) { aheadPt = polylinePoints[i]; break; }
    }

    const now = Date.now();
    const prevAhead = lastWeatherAheadPtRef.current;
    const aheadMoved = prevAhead
      ? haversineM(prevAhead.lat, prevAhead.lng, aheadPt[0], aheadPt[1])
      : Infinity;
    if (now - lastWeatherFetchRef.current < WEATHER_THROTTLE_MS && aheadMoved < WEATHER_AHEAD_REFETCH_M) {
      return;
    }

    isFetchingWeatherRef.current = true;
    lastWeatherFetchRef.current = now;
    lastWeatherAheadPtRef.current = { lat: aheadPt[0], lng: aheadPt[1] };
    setWeatherLoading(true);
    try {
      const resp = await apiRequest("POST", "/api/planned-routes/weather", {
        waypoints: [
          { lat, lng, name: "Posizione attuale" },
          { lat: aheadPt[0], lng: aheadPt[1], name: "Prossima zona" },
        ],
        departureIso: new Date().toISOString(),
      });
      const data: NavWeatherZone[] = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        setCurrentWeather(data[0] ?? null);
        setAheadWeather(data[1] ?? null);
      }
    } catch (e) {
      console.warn("[NavWeather] fetch failed:", e);
    } finally {
      isFetchingWeatherRef.current = false;
      setWeatherLoading(false);
    }
  };

  return { fetchNavWeather };
};
