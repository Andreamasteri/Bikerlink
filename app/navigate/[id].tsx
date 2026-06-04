import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Alert,
  Linking,
  ActivityIndicator,
  Pressable,
  TouchableOpacity,
} from "react-native";
import WebView from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { useColors } from "@/hooks/useColors";
import { useOfflineTiles } from "@/hooks/useOfflineTiles";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { haversineM, closestPointIndexOnPolyline } from "@/lib/geo";
import { useMapConfig } from "@/lib/map-context";
import { useLocale, useT } from "@/lib/language-context";
import { decodePolylineTuples as decodePolyline } from "@/lib/polyline";
import { NavigationMap } from "@/components/navigate/NavigationMap";
import { NavigationInstruction } from "@/components/navigate/NavigationInstruction";
import { NavigationWeather, type NavWeatherZone } from "@/components/navigate/NavigationWeather";
import { NavigationFinished } from "@/components/navigate/NavigationFinished";
import type { NavigationStep, PlannedRoute } from "./[id].types";
import {
  saveRouteToCache,
  loadRouteFromCache,
  activeStepIndex,
  signToIcon,
  formatDistance,
  formatDuration,
} from "./[id].helpers";
import { makeStyles } from "@/components/navigate/[id].styles";
import { useWhisperRecorder } from "@/hooks/useWhisperRecorder";

// ─── Constants ────────────────────────────────────────────────────────────────

const ANNOUNCE_DISTANCE_FAR = 200;
const ANNOUNCE_DISTANCE_NEAR = 50;
const REROUTE_DISTANCE_M = 200;
const REROUTE_DELAY_MS = 5000;
const WEATHER_AHEAD_KM = 15;
const WEATHER_THROTTLE_MS = 10 * 60 * 1000;
const WEATHER_AHEAD_REFETCH_M = 15000;

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NavigateScreen() {
  const colors = useColors();
  const { activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const locale = useLocale();
  const t = useT();
  const whisper = useWhisperRecorder();

  const topPad = insets.top;
  const bottomPad = insets.bottom;

  const webViewRef = useRef<WebView>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const announcedFarRef = useRef<Set<number>>(new Set());
  const announcedNearRef = useRef<Set<number>>(new Set());

  // Rerouting refs
  const offRouteStartRef = useRef<number | null>(null);
  const isReroutingRef = useRef(false);
  const lastKnownPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const activeStepsRef = useRef<NavigationStep[] | null>(null);
  const activeTotalKmRef = useRef<number | null>(null);
  const activeTotalMinRef = useRef<number | null>(null);

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

  // Weather during navigation
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [currentWeather, setCurrentWeather] = useState<NavWeatherZone | null>(null);
  const [aheadWeather, setAheadWeather] = useState<NavWeatherZone | null>(null);
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

  const offlineRoutePoints = React.useMemo(
    () => polylinePoints.map(([lat, lng]) => ({ lat, lng })),
    [polylinePoints]
  );
  const offline = useOfflineTiles(id, route?.title ?? "", offlineRoutePoints);

  // Decode polyline once route loads; also seed active refs
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
  }, [route]);

  // Request location permission and start watching
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

  // Start GPS watch when permission granted and route loaded
  useEffect(() => {
    if (!hasPermission || !route || polylinePoints.length === 0) return;

    let sub: Location.LocationSubscription | null = null;
    (async () => {
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 5 },
        (loc) => {
          handlePositionUpdate(loc.coords.latitude, loc.coords.longitude, loc.coords.heading ?? 0);
        }
      );
      locationSubRef.current = sub;
    })();

    return () => {
      sub?.remove();
      locationSubRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPermission, route?.id, polylinePoints.length]);

  const triggerReroute = useCallback(async (lat: number, lng: number) => {
    if (isReroutingRef.current || !route) return;
    isReroutingRef.current = true;
    offRouteStartRef.current = null;
    setIsRerouting(true);

    try {
      const wps = (route.waypoints ?? []).filter((wp) => wp.lat !== 0 || wp.lng !== 0);
      const destination = wps.length > 0 ? wps[wps.length - 1] : null;
      if (!destination) return;

      const resp = await apiRequest("POST", "/api/planned-routes/calculate", {
        waypoints: [{ lat, lng }, { lat: destination.lat, lng: destination.lng }],
        style: "curvy",
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
        // Update active route refs before re-render
        activeStepsRef.current = newRoute.navigationSteps ?? null;
        if (newRoute.distanceKm) activeTotalKmRef.current = newRoute.distanceKm;
        if (newRoute.durationMinutes) activeTotalMinRef.current = newRoute.durationMinutes;

        // Reset step tracking
        announcedFarRef.current.clear();
        announcedNearRef.current.clear();
        setCurrentStep(0);
        setMapReady(false); // WebView will reload; block JS injection until new bridge is ready

        // Update polyline — triggers mapHtml recompute → WebView reloads with new route
        setPolylinePoints(newPts);

        Speech.speak(t("nav.rerouted"), { language: locale });
      }
    } catch (e) {
      console.warn("[Rerouting] failed:", e);
    } finally {
      isReroutingRef.current = false;
      setIsRerouting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  const triggerRerouteRef = useRef(triggerReroute);
  useEffect(() => { triggerRerouteRef.current = triggerReroute; }, [triggerReroute]);

  // Route from current GPS position to a new destination (used by voice command)
  const triggerRerouteToDestination = useCallback(async (destLat: number, destLng: number) => {
    if (isReroutingRef.current || !route) return;
    isReroutingRef.current = true;
    offRouteStartRef.current = null;
    setIsRerouting(true);

    try {
      const origin = lastKnownPosRef.current;
      if (!origin) {
        // No GPS fix yet — fall back to first route waypoint as origin
        const wps = (route.waypoints ?? []).filter((wp) => wp.lat !== 0 || wp.lng !== 0);
        if (wps.length === 0) return;
        lastKnownPosRef.current = { lat: wps[0].lat, lng: wps[0].lng };
      }
      const { lat: oLat, lng: oLng } = lastKnownPosRef.current!;

      const resp = await apiRequest("POST", "/api/planned-routes/calculate", {
        waypoints: [{ lat: oLat, lng: oLng }, { lat: destLat, lng: destLng }],
        style: "curvy",
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
        if (newRoute.distanceKm) activeTotalKmRef.current = newRoute.distanceKm;
        if (newRoute.durationMinutes) activeTotalMinRef.current = newRoute.durationMinutes;
        announcedFarRef.current.clear();
        announcedNearRef.current.clear();
        setCurrentStep(0);
        setMapReady(false);
        setPolylinePoints(newPts);
        Speech.speak(t("nav.rerouted"), { language: locale });
      }
    } catch (e) {
      console.warn("[VoiceReroute] failed:", e);
    } finally {
      isReroutingRef.current = false;
      setIsRerouting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // ── Live weather sampling (current + ~15km ahead) ────────────────────────────
  const fetchNavWeather = useCallback(async (lat: number, lng: number, closestIdx: number) => {
    if (isFetchingWeatherRef.current || polylinePoints.length === 0) return;

    // Punto ~15 km più avanti lungo la polyline.
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
  }, [polylinePoints]);

  const fetchNavWeatherRef = useRef(fetchNavWeather);
  useEffect(() => { fetchNavWeatherRef.current = fetchNavWeather; }, [fetchNavWeather]);

  // Ricalcolo on-demand evitando il maltempo (mai automatico).
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
        if (newRoute.distanceKm) activeTotalKmRef.current = newRoute.distanceKm;
        if (newRoute.durationMinutes) activeTotalMinRef.current = newRoute.durationMinutes;
        announcedFarRef.current.clear();
        announcedNearRef.current.clear();
        setCurrentStep(0);
        setMapReady(false);
        setPolylinePoints(newPts);
        // Forza un nuovo campionamento meteo sul nuovo percorso.
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
  }, [route, locale, t]);

  const handlePositionUpdate = useCallback((lat: number, lng: number, heading: number) => {
    if (polylinePoints.length === 0) return;
    lastKnownPosRef.current = { lat, lng };

    const closestIdx = closestPointIndexOnPolyline(lat, lng, polylinePoints);
    const closestDist = haversineM(lat, lng, polylinePoints[closestIdx][0], polylinePoints[closestIdx][1]);

    // ── Off-route detection ──────────────────────────────────────────────────
    if (!isReroutingRef.current) {
      if (closestDist > REROUTE_DISTANCE_M) {
        if (offRouteStartRef.current === null) {
          offRouteStartRef.current = Date.now();
        } else if (Date.now() - offRouteStartRef.current >= REROUTE_DELAY_MS) {
          triggerRerouteRef.current(lat, lng);
        }
      } else {
        offRouteStartRef.current = null;
      }
    }

    // Progress
    const pct = Math.min(100, Math.round((closestIdx / Math.max(1, polylinePoints.length - 1)) * 100));
    setProgressPct(pct);

    // Live weather (throttled inside the helper)
    fetchNavWeatherRef.current(lat, lng, closestIdx);

    // Update WebView map
    if (mapReady && webViewRef.current) {
      webViewRef.current.injectJavaScript(
        `window.navBridge && window.navBridge.updatePosition(${lat}, ${lng}, ${heading}, ${closestIdx}); true;`
      );
    }

    // Steps — use active (possibly rerouted) steps
    const steps = activeStepsRef.current ?? route?.navigationSteps;
    if (!steps || steps.length === 0) return;

    const stepIdx = activeStepIndex(closestIdx, steps);
    setCurrentStep(stepIdx);

    // Distance to next step
    const nextStep = steps[stepIdx + 1];
    if (nextStep) {
      const nextPtIdx = nextStep.interval[0];
      if (nextPtIdx < polylinePoints.length) {
        const distM = haversineM(lat, lng, polylinePoints[nextPtIdx][0], polylinePoints[nextPtIdx][1]);
        setDistanceToNext(distM);

        // Remaining distance/time
        const remainingPts = polylinePoints.slice(closestIdx);
        let remDist = 0;
        for (let i = 1; i < remainingPts.length; i++) {
          remDist += haversineM(remainingPts[i-1][0], remainingPts[i-1][1], remainingPts[i][0], remainingPts[i][1]);
        }
        const remKm = Math.round(remDist / 100) / 10;
        setRemainingKm(remKm);

        const totalKm = activeTotalKmRef.current ?? route?.distanceKm ?? remKm;
        const totalMin = activeTotalMinRef.current ?? route?.durationMinutes ?? 0;
        if (totalKm > 0 && totalMin > 0) {
          setRemainingMin(Math.round((remKm / totalKm) * totalMin));
        }

        // Voice announcements
        if (distM <= ANNOUNCE_DISTANCE_FAR && !announcedFarRef.current.has(stepIdx)) {
          announcedFarRef.current.add(stepIdx);
          const streetPart = nextStep.streetName
            ? ` ${t("nav.announce.via").replace("{street}", nextStep.streetName)}`
            : "";
          const announcement = t("nav.announce.far")
            .replace("{distance}", String(Math.round(distM)))
            .replace("{instruction}", nextStep.text) + streetPart;
          Speech.speak(announcement, { language: locale });
        } else if (distM <= ANNOUNCE_DISTANCE_NEAR && !announcedNearRef.current.has(stepIdx)) {
          announcedNearRef.current.add(stepIdx);
          Speech.speak(nextStep.text, { language: locale });
        }
      }
    } else if (stepIdx === steps.length - 1 && pct >= 95) {
      // Arrived
      if (!isFinished) {
        setIsFinished(true);
        setDistanceToNext(null);
        Speech.speak(t("nav.announce.arrived"), { language: locale });
      }
    }
  }, [polylinePoints, route, mapReady, isFinished, locale, t]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebView message event
  const handleMapMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "mapReady") setMapReady(true);
    } catch {
      // no-op: silent failure for invalid JSON from map bridge
    }
  }, []);

  const handleOpenInGoogleMaps = () => {
    if (!route?.waypoints?.length) return;
    const wps = route.waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (!wps.length) return;
    const origin = `${wps[0].lat},${wps[0].lng}`;
    const dest = `${wps[wps.length - 1].lat},${wps[wps.length - 1].lng}`;
    const mid = wps.slice(1, -1).map((wp) => `${wp.lat},${wp.lng}`).join("|");
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
    if (mid) url += `&waypoints=${mid}`;
    Linking.openURL(url);
  };

  const handleOpenInWaze = () => {
    if (!route?.waypoints?.length) return;
    const wps = route.waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (!wps.length) return;
    const dest = wps[wps.length - 1];
    Linking.openURL(`https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`);
  };

  const handleOpenInAppleMaps = () => {
    if (!route?.waypoints?.length) return;
    const wps = route.waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (!wps.length) return;
    const dest = wps[wps.length - 1];
    Linking.openURL(`maps://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=d`);
  };

  const [voiceCmdToast, setVoiceCmdToast] = useState<string | null>(null);

  const handleVoiceCommand = useCallback(async () => {
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
  }, [whisper, triggerRerouteToDestination]);

  const handleClose = () => {
    Speech.stop();
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    router.back();
  };

  const s = makeStyles(colors);

  // Build map URI — rebuilt whenever polylinePoints or offline tile status change
  const mapUri = React.useMemo(() => {
    if (polylinePoints.length < 2) return null;
    const stepsForMap = activeStepsRef.current ?? route?.navigationSteps ?? [];
    const stepPoints = stepsForMap.map((step) => {
      const idx = step.interval[0];
      return idx < polylinePoints.length ? polylinePoints[idx] : polylinePoints[0];
    });
    const base = getApiUrl() + "/leaflet-navigation-map.html";
    let uri =
      base +
      "?tileUrl=" + encodeURIComponent(activeTileUrl) +
      "&maxZoom=" + activeTileMaxZoom +
      "&routeCoords=" + encodeURIComponent(JSON.stringify(polylinePoints)) +
      "&stepCoords=" + encodeURIComponent(JSON.stringify(stepPoints));
    if (offline.status === "available" && offline.offlineTileBasePath) {
      uri += "&offlinePath=" + encodeURIComponent(offline.offlineTileBasePath);
    }
    return uri;
  }, [polylinePoints, route?.navigationSteps, offline.status, offline.offlineTileBasePath, activeTileUrl, activeTileMaxZoom]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading || !route) {
    return (
      <View style={[s.container, { paddingTop: topPad }]}>
        <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  // ── Finished screen ────────────────────────────────────────────────────────

  if (isFinished) {
    return (
      <NavigationFinished
        route={route}
        topPad={topPad}
        bottomPad={bottomPad}
        formatDuration={formatDuration}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
        onSave={() => router.replace(`/route/tracking` as any)}
        onClose={handleClose}
      />
    );
  }

  const steps = activeStepsRef.current ?? route.navigationSteps ?? [];
  const step = steps[currentStep];

  return (
    <View style={s.container}>
      <NavigationMap
        mapUri={mapUri}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebView ref type
        webViewRef={webViewRef as any}
        handleMapMessage={handleMapMessage}
        handleClose={handleClose}
        isRerouting={isRerouting}
        remainingKm={remainingKm}
        remainingMin={remainingMin}
        topPad={topPad}
        formatDuration={formatDuration}
      />

      {/* Progress bar */}
      <View style={s.progressBg}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- percentage string for width */}
        <View style={[s.progressFill, { width: `${progressPct}%` as any }]} />
      </View>

      {/* Offline banner */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={s.offlineBannerText}>Modalità offline — percorso in cache</Text>
        </View>
      )}

      {/* Download map banner — visible only when tiles are not yet available */}
      {(offline.status === "none" || offline.status === "error") && (
        <Pressable style={s.downloadBanner} onPress={offline.startDownload}>
          <Ionicons name="download-outline" size={15} color="#fff" />
          <Text style={s.downloadBannerText}>
            {offline.status === "error" ? t("nav.offline.retry") : t("nav.offline.download")}
          </Text>
          {offline.status === "error" && (
            <Ionicons name="alert-circle-outline" size={16} color="rgba(255,200,100,0.9)" />
          )}
        </Pressable>
      )}

      {/* Offline map available indicator with delete action */}
      {offline.status === "available" && (
        <Pressable
          style={s.offlineAvailableBanner}
          onPress={() => {
            Alert.alert(
              "Rimuovi mappa offline",
              "Vuoi eliminare le mappe salvate per questo percorso?",
              [
                { text: "Annulla", style: "cancel" },
                {
                  text: "Rimuovi",
                  style: "destructive",
                  onPress: () => offline.deleteOffline(),
                },
              ]
            );
          }}
        >
          <Ionicons name="checkmark-circle-outline" size={15} color="#22c55e" />
          <Text style={s.offlineAvailableBannerText}>Mappa offline ✓</Text>
          <Ionicons name="trash-outline" size={15} color="rgba(255,255,255,0.6)" />
        </Pressable>
      )}

      {offline.status === "downloading" && (
        <View style={s.downloadBanner}>
          <Ionicons name="cloud-download-outline" size={15} color="#fff" />
          <View style={s.downloadProgressWrap}>
            <Text style={s.downloadBannerText}>
              {t("nav.offline.downloading")} {offline.total > 0 ? `${Math.round((offline.progress / offline.total) * 100)}%` : "0%"}
            </Text>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- percentage width string required by StyleSheet */}
            <View style={[s.downloadProgressBg]}><View style={[s.downloadProgressFill, { width: (offline.total > 0 ? `${Math.round((offline.progress / offline.total) * 100)}%` : "0%") as any }]} /></View>
          </View>
          <Pressable onPress={offline.cancelDownload} hitSlop={8}>
            <Ionicons name="close-circle-outline" size={18} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      )}

      {/* Stale offline tiles banner — shown after a reroute when the cached
          tiles no longer fully cover the new polyline */}
      {offline.status === "stale" && (
        <View style={s.staleBanner}>
          <Ionicons name="map-outline" size={14} color="#fff" />
          <Text style={s.staleBannerText}>
            Mappe offline non coprono il percorso ricalcolato
          </Text>
        </View>
      )}

      {/* Voice command button */}
      <TouchableOpacity
        style={[
          s.voiceMicBtn,
          whisper.recording && s.voiceMicBtnActive,
        ]}
        onPressIn={() => whisper.startRecording()}
        onPressOut={handleVoiceCommand}
        activeOpacity={0.8}
      >
        {whisper.transcribing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons
            name={whisper.recording ? "mic" : "mic-outline"}
            size={22}
            color="#fff"
          />
        )}
      </TouchableOpacity>

      {/* Voice command toast */}
      {voiceCmdToast !== null && (
        <View style={s.voiceToast}>
          <Text style={s.voiceToastText} numberOfLines={2}>{voiceCmdToast}</Text>
        </View>
      )}

      <NavigationWeather
        topPad={topPad}
        loading={weatherLoading}
        current={currentWeather}
        ahead={aheadWeather}
        rerouting={isRerouting}
        onAvoidWeather={triggerWeatherReroute}
      />

      <NavigationInstruction
        step={step}
        nextStep={steps[currentStep + 1] ?? null}
        distanceToNext={distanceToNext}
        bottomPad={bottomPad}
        signToIcon={signToIcon}
        formatDistance={formatDistance}
        handleOpenInGoogleMaps={handleOpenInGoogleMaps}
        handleOpenInWaze={handleOpenInWaze}
        handleOpenInAppleMaps={handleOpenInAppleMaps}
      />
    </View>
  );
}
