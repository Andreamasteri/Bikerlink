// LARGE-FILE-ALLOW: schermata/modulo — merge @no-split di file lazy-split
// overflow di app/navigate/[id].tsx — tutta la logica di stato estratta
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Alert } from "react-native";
import WebView from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { useColors } from "@/hooks/useColors";
import { useOfflineTiles } from "@/hooks/useOfflineTiles";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { haversineM, closestPointIndexOnPolyline } from "@/lib/geo";
import { useMapConfig } from "@/lib/map-context";
import { useLocale, useT } from "@/lib/language-context";
import { decodePolylineTuples as decodePolyline } from "@/lib/polyline";
import type { NavigationStep, PlannedRoute, TechnicalCheckpoint } from "@/components/navigate/navigate-types";
import {
  saveRouteToCache,
  loadRouteFromCache,
  activeStepIndex,
} from "@/components/navigate/navigate-helpers";
import { useLocationGate } from "@/lib/location-context";
import { usePlayer } from "@/lib/player-context";
import type { NavWeatherZone } from "@/components/navigate/NavigationWeather";

/* eslint-disable @typescript-eslint/no-explicit-any */
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

const LOCAL_TURN_PHRASES: Record<string, string> = {
  "navigation.turn.left": "Svoltare a sinistra",
  "navigation.turn.right": "Svoltare a destra",
  "navigation.turn.u_turn": "Fare inversione a U",
};

export function announceTechnicalCheckpoint(
  checkpoint: TechnicalCheckpoint,
  announced: Set<string>,
  locale: string,
): void {
  if (announced.has(checkpoint.id)) return;
  announced.add(checkpoint.id);
  const phrase = LOCAL_TURN_PHRASES[checkpoint.audioKey] ?? checkpoint.instruction;
  Speech.speak(phrase, { language: locale });
}

export function calculateRemainingDist(polylinePoints: Array<[number, number]>, closestIdx: number): number {
  const remainingPts = polylinePoints.slice(closestIdx);
  let remDist = 0;
  for (let i = 1; i < remainingPts.length; i++) {
    remDist += haversineM(remainingPts[i-1][0], remainingPts[i-1][1], remainingPts[i][0], remainingPts[i][1]);
  }
  return remDist;
}

export const useNavigateStates = () => {
  const [mapReady, setMapReady] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [distanceToNext, setDistanceToNext] = useState<number | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [remainingKm, setRemainingKm] = useState<number | null>(null);
  const [remainingMin, setRemainingMin] = useState<number | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [isOffRoute, setIsOffRoute] = useState(false);
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
    isOffRoute, setIsOffRoute,
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
/* eslint-enable @typescript-eslint/no-explicit-any */

const _ANNOUNCE_DISTANCE_FAR = 200;
const _ANNOUNCE_DISTANCE_NEAR = 50;
const REROUTE_DISTANCE_M = 200;
const REROUTE_DELAY_MS = 5000;
const WEATHER_AHEAD_KM = 15;
const WEATHER_THROTTLE_MS = 10 * 60 * 1000;
const WEATHER_AHEAD_REFETCH_M = 15000;

export function useNavigateState() {
  const colors = useColors();
  const { activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { id } = useLocalSearchParams<{ id: string }>();
  const locale = useLocale();
  const t = useT();
  const { suspendSharedWatch, resumeSharedWatch } = useLocationGate();
  const { stop: stopMusic } = usePlayer();

  const topPad = insets.top;
  const bottomPad = insets.bottom;

  const webViewRef = useRef<WebView>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const announcedFarRef = useRef<Set<number>>(new Set());
  const announcedNearRef = useRef<Set<number>>(new Set());

  const offRouteStartRef = useRef<number | null>(null);
  const isOffRouteRef = useRef(false);
  const isReroutingRef = useRef(false);
  const lastKnownPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const activeStepsRef = useRef<NavigationStep[] | null>(null);
  const activeTechnicalCheckpointsRef = useRef<TechnicalCheckpoint[]>([]);
  const announcedCheckpointRef = useRef<Set<string>>(new Set());
  const activeTotalKmRef = useRef<number | null>(null);
  const activeTotalMinRef = useRef<number | null>(null);
  const liveLastSentAtRef = useRef(0);
  const liveStartedRef = useRef(false);

  const {
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
    isOffRoute, setIsOffRoute,
    isOffline, setIsOffline,
    weatherLoading, setWeatherLoading,
    currentWeather, setCurrentWeather,
    aheadWeather, setAheadWeather,
  } = useNavigateStates();

  const lastWeatherFetchRef = useRef<number>(0);
  const lastWeatherAheadPtRef = useRef<{ lat: number; lng: number } | null>(null);
  const isFetchingWeatherRef = useRef(false);

  const { data: route, isLoading } = useQuery<PlannedRoute>({
    queryKey: ["/api/planned-routes", id],
    queryFn: async () => {
      try {
        const resp = await apiRequest("GET", `/api/planned-routes/${id}`);
        const data: PlannedRoute = await resp.json();
        setIsOffline(false);
        saveRouteToCache(data);
        return data;
      } catch {
        const cached = await loadRouteFromCache(id ?? "");
        if (cached) {
          setIsOffline(true);
          return cached;
        }
        throw new Error("Nessuna connessione e nessuna cache disponibile.");
      }
    },
    enabled: !!id,
    retry: false,
  });

  const sendLiveEvent = useCallback((
    event: "start" | "position" | "waypoint" | "arrived" | "off_route" | "stopped",
    latitude: number | null,
    longitude: number | null,
    positionSource: "gps" | "waypoint" | "destination" | "dead_reckoning" | "unknown",
    progressPct: number | null,
    waypointIndex: number | null,
    accuracyM: number | null = null,
    locationAgeMs = 0,
  ) => {
    if (!route?.id) return;
    const now = Date.now();
    if (event === "position" && now - liveLastSentAtRef.current < 15_000) return;
    liveLastSentAtRef.current = now;
    if (event === "start") liveStartedRef.current = true;
    void apiRequest("POST", "/api/planned-routes/" + route.id + "/live", {
      event,
      latitude,
      longitude,
      positionSource,
      progressPct,
      waypointIndex,
      accuracyM,
      locationAgeMs,
      eventAt: new Date(now).toISOString(),
    }).catch(() => {});
  }, [route?.id]);

  const offlineRoutePoints = React.useMemo(
    () => polylinePoints.map(([lat, lng]) => ({ lat, lng })),
    [polylinePoints]
  );
  const offline = useOfflineTiles(id, route?.title ?? "", offlineRoutePoints);

  useEffect(() => {
    if (!route) return;
    let pts: Array<[number, number]> = [];
    if (route.polyline) {
      pts = decodePolyline(route.polyline);
    } else if (route.waypoints?.length) {
      pts = route.waypoints
        .filter((wp) => wp.lat !== 0 || wp.lng !== 0)
        .map((wp) => [wp.lat, wp.lng]);
    }
    setPolylinePoints(pts);
    if (route.distanceKm) {
      setRemainingKm(route.distanceKm);
      activeTotalKmRef.current = route.distanceKm;
    }
    if (route.durationMinutes) {
      setRemainingMin(route.durationMinutes);
      activeTotalMinRef.current = route.durationMinutes;
    }
    activeStepsRef.current = route.navigationSteps ?? null;
    activeTechnicalCheckpointsRef.current = route.metadata?.technicalCheckpoints ?? [];
    announcedCheckpointRef.current.clear();
    offRouteStartRef.current = null;
    isOffRouteRef.current = false;
    setIsOffRoute(false);
  }, [route, setPolylinePoints, setRemainingKm, setRemainingMin]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active) return;
      if (status !== "granted") {
        Alert.alert(t("nav.no_gps"), t("nav.no_gps_msg"), [
          { text: "OK", onPress: () => router.back() }
        ]);
        return;
      }
      setHasPermission(true);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasPermission || !route || polylinePoints.length === 0) return;

    suspendSharedWatch();

    let sub: Location.LocationSubscription | null = null;
    (async () => {
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 5 },
        (loc) => {
          const fixTimestamp = Number.isFinite(loc.timestamp) ? loc.timestamp : Date.now();
          const locationAgeMs = Math.max(0, Date.now() - fixTimestamp);
          handlePositionUpdate(
            loc.coords.latitude,
            loc.coords.longitude,
            loc.coords.heading ?? 0,
            "gps",
            loc.coords.accuracy ?? null,
            locationAgeMs,
          );
        }
      );
      locationSubRef.current = sub;
    })();

    return () => {
      sub?.remove();
      locationSubRef.current = null;
      resumeSharedWatch();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPermission, route?.id, polylinePoints.length]);

  const { fetchNavWeather } = useWeatherHandlers(
    isFetchingWeatherRef,
    lastWeatherFetchRef,
    lastWeatherAheadPtRef,
    setWeatherLoading,
    setCurrentWeather,
    setAheadWeather,
    polylinePoints,
    WEATHER_AHEAD_KM,
    WEATHER_THROTTLE_MS,
    WEATHER_AHEAD_REFETCH_M
  );

  const fetchNavWeatherRef = useRef(fetchNavWeather);
  useEffect(() => { fetchNavWeatherRef.current = fetchNavWeather; }, [fetchNavWeather]);

  const triggerWeatherReroute = useCallback(async () => {
    if (isReroutingRef.current || !route) return;
    const origin = lastKnownPosRef.current;
    const wps = (route.waypoints ?? []).filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    const destination = wps.length > 0 ? wps[wps.length - 1] : null;
    if (!origin || !destination) return;

    isReroutingRef.current = true;
    offRouteStartRef.current = null;
    setIsRerouting(true);
    try {
      const resp = await apiRequest("POST", "/api/planned-routes/calculate", {
        waypoints: [{ lat: origin.lat, lng: origin.lng }, { lat: destination.lat, lng: destination.lng }],
        style: "curvy",
        avoidWeather: true,
      });
      const newRoute = await resp.json();

      let newPts: Array<[number, number]> = [];
      if (newRoute.polyline) {
        newPts = decodePolyline(newRoute.polyline);
      } else if (newRoute.waypoints?.length) {
        newPts = (newRoute.waypoints as Array<{ lat: number; lng: number }>)
          .filter((wp) => wp.lat !== 0 || wp.lng !== 0)
          .map((wp) => [wp.lat, wp.lng]);
      }

      if (newPts.length > 1) {
        activeStepsRef.current = newRoute.navigationSteps ?? null;
        activeTechnicalCheckpointsRef.current = newRoute.technicalCheckpoints ?? [];
        announcedCheckpointRef.current.clear();
        isOffRouteRef.current = false;
        setIsOffRoute(false);
        if (newRoute.distanceKm) activeTotalKmRef.current = newRoute.distanceKm;
        if (newRoute.durationMinutes) activeTotalMinRef.current = newRoute.durationMinutes;
        announcedFarRef.current.clear();
        announcedNearRef.current.clear();
        setCurrentStep(0);
        setMapReady(false);
        setPolylinePoints(newPts);
        lastWeatherFetchRef.current = 0;
        lastWeatherAheadPtRef.current = null;
        Speech.speak(t("nav.rerouted"), { language: locale });
      }
    } catch (e) {
      console.warn("[WeatherReroute] failed:", e);
    } finally {
      isReroutingRef.current = false;
      setIsRerouting(false);
    }
  }, [route, locale, t, setCurrentStep, setIsRerouting, setMapReady, setPolylinePoints]);

  const handlePositionUpdate = useCallback((
    lat: number,
    lng: number,
    heading: number,
    positionSource: "gps" | "dead_reckoning" = "gps",
    accuracyM: number | null = null,
    locationAgeMs = 0,
  ) => {
    if (polylinePoints.length === 0) return;
    lastKnownPosRef.current = { lat, lng };

    for (const checkpoint of activeTechnicalCheckpointsRef.current) {
      const distanceToCheckpoint = haversineM(lat, lng, checkpoint.latitude, checkpoint.longitude);
      const triggerRadius = Math.max(35, Math.min(75, checkpoint.distanceBeforeM * 0.35));
      if (distanceToCheckpoint <= triggerRadius) {
        announceTechnicalCheckpoint(checkpoint, announcedCheckpointRef.current, locale);
      }
    }

    const closestIdx = closestPointIndexOnPolyline(lat, lng, polylinePoints);
    const closestDist = haversineM(lat, lng, polylinePoints[closestIdx][0], polylinePoints[closestIdx][1]);

    if (!isReroutingRef.current) {
      if (closestDist > REROUTE_DISTANCE_M) {
        if (offRouteStartRef.current === null) {
          offRouteStartRef.current = Date.now();
        } else if (Date.now() - offRouteStartRef.current >= REROUTE_DELAY_MS) {
          isOffRouteRef.current = true;
          setIsOffRoute(true);
          // La musica, se attiva, non deve continuare mentre il tracciato è perso.
          stopMusic();
        }
      } else {
        offRouteStartRef.current = null;
        if (isOffRouteRef.current) {
          isOffRouteRef.current = false;
          setIsOffRoute(false);
        }
      }
    }

    const pct = Math.min(100, Math.round((closestIdx / Math.max(1, polylinePoints.length - 1)) * 100));
    const nearbyWaypointIndex = (route?.waypoints ?? []).findIndex((wp) =>
      haversineM(lat, lng, wp.lat, wp.lng) <= 100
    );
    const liveEvent = isOffRouteRef.current
      ? "off_route"
      : nearbyWaypointIndex >= 0
        ? "waypoint"
        : (liveStartedRef.current ? "position" : "start");
    sendLiveEvent(
      liveEvent,
      lat,
      lng,
      positionSource,
      pct,
      nearbyWaypointIndex >= 0 ? nearbyWaypointIndex : null,
      accuracyM,
      locationAgeMs,
    );

    if (mapReady && webViewRef.current) {
      webViewRef.current.injectJavaScript(
        `window.navBridge && window.navBridge.updatePosition(${lat}, ${lng}, ${heading}, ${closestIdx}); true;`
      );
    }

    // Fuori percorso: mantieni la mappa e la rotta programmata visibili, ma
    // congela progressione e contatori finché l’utente non rientra sul tracciato.
    if (isOffRouteRef.current) return;

    setProgressPct(pct);
    fetchNavWeatherRef.current(lat, lng, closestIdx);

    const steps = activeStepsRef.current ?? route?.navigationSteps;
    if (!steps || steps.length === 0) return;

    const stepIdx = activeStepIndex(closestIdx, steps);
    setCurrentStep(stepIdx);

    const nextStep = steps[stepIdx + 1];
    if (nextStep) {
      const nextPtIdx = nextStep.interval[0];
      if (nextPtIdx < polylinePoints.length) {
        const distM = haversineM(lat, lng, polylinePoints[nextPtIdx][0], polylinePoints[nextPtIdx][1]);
        setDistanceToNext(distM);

        const remDist = calculateRemainingDist(polylinePoints, closestIdx);
        const remKm = Math.round(remDist / 100) / 10;
        setRemainingKm(remKm);

        const totalKm = activeTotalKmRef.current ?? route?.distanceKm ?? remKm;
        const totalMin = activeTotalMinRef.current ?? route?.durationMinutes ?? 0;
        if (totalKm > 0 && totalMin > 0) {
          setRemainingMin(Math.round((remKm / totalKm) * totalMin));
        }

        announceStep(distM, stepIdx, nextStep, announcedFarRef.current, announcedNearRef.current, t, locale);
      }
    } else if (stepIdx === steps.length - 1 && pct >= 95) {
      if (!isFinished) {
        setIsFinished(true);
        setDistanceToNext(null);
        sendLiveEvent(
          "arrived",
          lat,
          lng,
          "destination",
          100,
          (route?.waypoints?.length ?? 1) - 1,
          accuracyM,
          locationAgeMs,
        );
        Speech.speak(t("nav.announce.arrived"), { language: locale });
      }
    }
  }, [polylinePoints, route, mapReady, isFinished, locale, t, sendLiveEvent, stopMusic, setCurrentStep, setDistanceToNext, setIsFinished, setIsOffRoute, setProgressPct, setRemainingKm, setRemainingMin]);

  const [minimalMode, setMinimalMode] = useState(false);
  const minimalManualRef = useRef(false);

  const handleToggleMinimal = useCallback(() => {
    const next = !minimalManualRef.current;
    minimalManualRef.current = next;
    webViewRef.current?.injectJavaScript(
      `window.navBridge && window.navBridge.setManualMinimal(${next}); true;`
    );
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebView message event
  const handleMapMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "mapReady") setMapReady(true);
      else if (data.type === "viewMode") setMinimalMode(!!data.minimal);
    } catch {
      // no-op
    }
  }, [setMapReady]);


  const handleClose = useCallback(() => {
    Speech.stop();
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    routerRef.current.back();
  }, []);

  const mapUri = React.useMemo(() => {
    if (polylinePoints.length < 2) return null;
    const stepsForMap = activeStepsRef.current ?? route?.navigationSteps ?? [];
    const stepPoints = stepsForMap.map((step) => {
      const idx = step.interval[0];
      return idx < polylinePoints.length ? polylinePoints[idx] : polylinePoints[0];
    });
    const base = getApiUrl() + "/leaflet-navigation-map.html";
    let uri = base + "?tileUrl=" + encodeURIComponent(activeTileUrl) + "&maxZoom=" + activeTileMaxZoom + "&routeCoords=" + encodeURIComponent(JSON.stringify(polylinePoints)) + "&stepCoords=" + encodeURIComponent(JSON.stringify(stepPoints));
    if (offline.status === "available" && offline.offlineTileBasePath) {
      uri += "&offlinePath=" + encodeURIComponent(offline.offlineTileBasePath);
    }
    return uri;
  }, [polylinePoints, route?.navigationSteps, offline.status, offline.offlineTileBasePath, activeTileUrl, activeTileMaxZoom]);

  return {
    colors, insets, topPad, bottomPad,
    webViewRef, route, isLoading, isFinished,
    mapReady, currentStep, distanceToNext, progressPct,
    remainingKm, remainingMin, polylinePoints,
    hasPermission, isRerouting, isOffRoute, isOffline,
    weatherLoading, currentWeather,
    mapUri, offline, activeStepsRef,
    minimalMode, handleToggleMinimal,
    handleMapMessage, handleClose, triggerWeatherReroute,
  };
}
