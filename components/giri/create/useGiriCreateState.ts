/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback } from "react";
import { Alert, Animated } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useApiDebugLog } from "@/hooks/useApiDebugLog";

import { 
  Waypoint, Style, DrivingProfile, VehicleProfile, Mode, RouteResult, 
  WeatherWaypoint, AiPreviewState,
  ResolvedPoiStop, PoiResult, GeoResult, SegmentRouteIntent
} from "./types";
import { calcRoute } from "./api";
import { handleImportGpxHelper, autoLoadWeatherHelper } from "./useGiriCreateState.part2";
import { handleAiParseHelper, regeocodePillItemHelper, selectPreviewItemSuggestionHelper, handleConfirmPreviewHelper } from "./useGiriCreateState.part3";

export const SELECTED_MOTO_STORAGE_KEY = "bikerlink_giri_selected_moto_id";

export function useGiriCreateState(language?: string) {
  const router = useRouter();
  const qc = useQueryClient();
  const { logs: debugLogs, clearLogs: clearDebugLogs, logFetch } = useApiDebugLog();
  const [debugVisible, setDebugVisible] = useState(__DEV__);
  const titleTapCount = useRef(0);
  const titleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isImportingGpx, setIsImportingGpx] = useState(false);
  const [mode, setMode] = useState<Mode>("ai");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);
  const [resolvedPoiStops, setResolvedPoiStops] = useState<ResolvedPoiStop[]>([]);
  const [aiProviderUsed, setAiProviderUsed] = useState<string | null>(null);
  const [aiFallbackBanner, setAiFallbackBanner] = useState(false);
  const [aiBannerReason, setAiBannerReason] = useState<"key_missing" | "generic">("generic");
  const [aiSuccessBanner, setAiSuccessBanner] = useState(false);
  const aiSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [title, setTitle] = useState("Giro in moto");
  const [style, setStyle] = useState<Style>("curvy");
  const [drivingProfile, setDrivingProfile] = useState<DrivingProfile>("geometric");
  const [vehicleProfile, setVehicleProfile] = useState<VehicleProfile>("moto");
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [roundTripHours, setRoundTripHours] = useState(3);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [daysCount, setDaysCount] = useState(2);
  const [maxHoursPerDay, setMaxHoursPerDay] = useState(6);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidFerries, setAvoidFerries] = useState(false);
  const [avoidUnpaved, setAvoidUnpaved] = useState(false);
  const [avoidWeather, setAvoidWeather] = useState(false);
  const [segmentIntents, setSegmentIntents] = useState<SegmentRouteIntent[] | null>(null);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [selectedMotoId, _setSelectedMotoId] = useState<string | null>(null);

  const setSelectedMotoId = useCallback((idOrUpdater: string | null | ((prev: string | null) => string | null)) => {
    _setSelectedMotoId((prev) => {
      const next = typeof idOrUpdater === "function" ? idOrUpdater(prev) : idOrUpdater;
      if (next !== null) {
        AsyncStorage.setItem(SELECTED_MOTO_STORAGE_KEY, next).catch(() => {});
      } else {
        AsyncStorage.removeItem(SELECTED_MOTO_STORAGE_KEY).catch(() => {});
      }
      return next;
    });
  }, []);

  const [fuelLevel, setFuelLevel] = useState<number>(100);

  const [waypoints, setWaypoints] = useState<Waypoint[]>([{ lat: 0, lng: 0, name: "" }, { lat: 0, lng: 0, name: "" }]);
  const [wpInputs, setWpInputs] = useState<string[]>(["", ""]);
  const [wpSuggestions, setWpSuggestions] = useState<{ index: number; results: any[]; error?: boolean } | null>(null);
  const [wpLoading, setWpLoading] = useState(false);

  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  const [weatherPreview, setWeatherPreview] = useState<WeatherWaypoint[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [pendingMapTap, setPendingMapTap] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [mapTapGeocoding, setMapTapGeocoding] = useState(false);
  const mapTapRequestId = useRef(0);

  const suggestionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bikerScoreAnim = useRef(new Animated.Value(0)).current;
  const lastFittedWaypointSig = useRef<string>('');
  const geocodeCache = useRef<Map<string, GeoResult[]>>(new Map());

  const handleTitleTap = useCallback(() => {
    titleTapCount.current += 1;
    if (titleTapTimer.current) clearTimeout(titleTapTimer.current);
    if (titleTapCount.current >= 5) {
      titleTapCount.current = 0;
      setDebugVisible((v) => !v);
      return;
    }
    titleTapTimer.current = setTimeout(() => { titleTapCount.current = 0; }, 1500);
  }, []);

  const autoLoadWeather = (wps: Waypoint[]) => autoLoadWeatherHelper(wps, setWeatherLoading, setWeatherPreview);

  const handleImportGpx = useCallback(() => handleImportGpxHelper(qc, router, setIsImportingGpx), [router, qc]);

  const handleAiParse = () => handleAiParseHelper(
    aiPrompt, setAiLoading, setResolvedPoiStops, setAiProviderUsed, setAiPreview,
    setMode, setAiSuccessBanner, aiSuccessTimer, logFetch, setTitle, setStyle,
    setIsRoundTrip, setIsMultiDay, setDaysCount, setAvoidHighways, setAiBannerReason,
    setAiFallbackBanner
  );

  const updatePreviewItemName = useCallback((idx: number, newName: string) => {
    setAiPreview((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], editedName: newName, lat: 0, lng: 0, resolved: false, suggestions: [] };
      return { ...prev, items };
    });
  }, []);

  const regeocodePillItem = useCallback((idx: number, name: string) => regeocodePillItemHelper(idx, name, setAiPreview, logFetch), [logFetch]);

  const selectPreviewItemSuggestion = useCallback((idx: number, candidate: GeoResult) => {
    selectPreviewItemSuggestionHelper(idx, candidate, setAiPreview);
  }, []);

  const selectPoiOption = useCallback((stopIdx: number, option: PoiResult) => {
    setResolvedPoiStops((prev) => {
      const updated = [...prev];
      updated[stopIdx] = { ...updated[stopIdx], selectedOption: option };
      return updated;
    });
  }, []);

  const clearPoiOption = useCallback((stopIdx: number) => {
    setResolvedPoiStops((prev) => {
      const updated = [...prev];
      updated[stopIdx] = { ...updated[stopIdx], selectedOption: null };
      return updated;
    });
  }, []);

  const handleConfirmPreview = () => {
    setSegmentIntents(null);
    return handleConfirmPreviewHelper(
    aiPreview, resolvedPoiStops, setTitle, setStyle, setIsRoundTrip, setHeadingDeg,
    setIsMultiDay, setDaysCount, setAvoidHighways, setWaypoints, setWpInputs,
    setMode, setCalculating, setRouteResult, setWeatherPreview, setDismissedWarnings,
    logFetch, drivingProfile, language, vehicleProfile, maxHoursPerDay, autoLoadWeather
    );
  };

  const enableSegmentIntents = () => {
    setSegmentIntents(Array.from({ length: Math.max(0, waypoints.length - 1) }, () => ({ kind: "inherit" })));
    setRouteResult(null);
  };

  const disableSegmentIntents = () => {
    setSegmentIntents(null);
    setRouteResult(null);
  };

  const updateSegmentIntent = (index: number, intent: SegmentRouteIntent) => {
    setSegmentIntents((current) => {
      if (!current || !current[index]) return current;
      const next = [...current];
      next[index] = intent;
      return next;
    });
    setRouteResult(null);
  };

  const handleWpInput = (text: string, index: number) => {
    const newInputs = [...wpInputs]; newInputs[index] = text; setWpInputs(newInputs);
    const newWps = [...waypoints]; newWps[index] = { ...newWps[index], name: text, lat: 0, lng: 0 }; setWaypoints(newWps);
    setRouteResult(null);
    if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    for (const key of geocodeCache.current.keys()) {
      if (key.startsWith(`${index}::`)) geocodeCache.current.delete(key);
    }
    if (text.length >= 3) {
      const cacheKey = `${index}::${text}`;
      const cached = geocodeCache.current.get(cacheKey);
      if (cached) {
        setWpLoading(false);
        setWpSuggestions({ index, results: cached });
        return;
      }
      setWpLoading(true);
      setWpSuggestions(null);
      suggestionTimeout.current = setTimeout(async () => {
        try {
          const results = await logFetch(
            "/api/planned-routes/geocode", "GET",
            () => { const url = new URL("/api/planned-routes/geocode", getApiUrl()); url.searchParams.set("q", text); return fetch(url.toString(), { credentials: "include" }); },
            async (resp: Response) => {
              if (!resp.ok) throw new Error(`geocode HTTP ${resp.status}`);
              return resp.json();
            }
          );
          geocodeCache.current.set(cacheKey, results);
          setWpSuggestions({ index, results });
        } catch {
          setWpSuggestions({ index, results: [], error: true });
        } finally {
          setWpLoading(false);
        }
      }, 600);
    } else {
      setWpLoading(false);
      setWpSuggestions(null);
    }
  };

  const selectSuggestion = (index: number, geo: any) => {
    const newWps = [...waypoints]; newWps[index] = { lat: geo.lat, lng: geo.lng, name: geo.name.split(",")[0] }; setWaypoints(newWps);
    const newInputs = [...wpInputs]; newInputs[index] = geo.name.split(",")[0]; setWpInputs(newInputs);
    setWpSuggestions(null);
    setRouteResult(null);
  };

  const addWaypoint = () => {
    const insertAt = waypoints.length - 1;
    const newWps = [...waypoints]; newWps.splice(insertAt, 0, { lat: 0, lng: 0, name: "" }); setWaypoints(newWps);
    const newInputs = [...wpInputs]; newInputs.splice(insertAt, 0, ""); setWpInputs(newInputs);
    setSegmentIntents((current) => {
      if (!current) return null;
      const next = [...current];
      // L'inserimento spezza una tratta in due: l'intento precedente non è più
      // associato alla stessa coppia di punti, quindi le nuove tratte ereditano
      // il profilo del giro finché l'utente non le configura esplicitamente.
      next.splice(insertAt - 1, 0, { kind: "inherit" });
      next[insertAt] = { kind: "inherit" };
      return next;
    });
    setRouteResult(null);
  };

  const removeWaypoint = (index: number) => {
    if (waypoints.length <= 2) return;
    setWaypoints(waypoints.filter((_, i) => i !== index));
    setWpInputs(wpInputs.filter((_, i) => i !== index));
    setSegmentIntents((current) => {
      if (!current) return null;
      const next = [...current];
      next.splice(index, 1);
      if (index > 0 && next[index - 1]) {
        // La nuova tratta unisce due estremi diversi: non riutilizzare
        // silenziosamente l'intento della tratta entrante rimossa.
        next[index - 1] = { kind: "inherit" };
      }
      return next;
    });
    setRouteResult(null);
  };

  const moveWaypoint = (index: number, direction: "up" | "down") => {
    const destination = direction === "up" ? index - 1 : index + 1;
    const isIntermediate = index > 0 && (isRoundTrip || index < waypoints.length - 1);
    const destinationIsIntermediate = destination > 0 && (isRoundTrip || destination < waypoints.length - 1);
    if (!isIntermediate || !destinationIsIntermediate || destination < 0 || destination >= waypoints.length) return;

    const nextWaypoints = [...waypoints];
    [nextWaypoints[index], nextWaypoints[destination]] = [nextWaypoints[destination], nextWaypoints[index]];
    setWaypoints(nextWaypoints);

    const nextInputs = [...wpInputs];
    [nextInputs[index], nextInputs[destination]] = [nextInputs[destination], nextInputs[index]];
    setWpInputs(nextInputs);

    setSegmentIntents((current) => {
      if (!current) return null;
      const next = [...current];
      // Lo scambio modifica al massimo le tre tratte attorno alle due ancore.
      // Le azzeriamo a "eredita" invece di applicare un intento pensato per
      // una coppia di punti diversa; le altre sezioni restano invariate.
      const firstChangedSegment = Math.max(0, Math.min(index, destination) - 1);
      const lastChangedSegment = Math.min(next.length - 1, Math.max(index, destination));
      for (let segmentIndex = firstChangedSegment; segmentIndex <= lastChangedSegment; segmentIndex += 1) {
        next[segmentIndex] = { kind: "inherit" };
      }
      return next;
    });
    setRouteResult(null);
    setWeatherPreview(null);
  };

  const handleCalculate = async () => {
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    const requiredWaypoints = isRoundTrip ? 1 : 2;
    if (resolved.length < requiredWaypoints) {
      Alert.alert(
        "Waypoint non risolti",
        isRoundTrip
          ? "Seleziona almeno la partenza del giro."
          : "Tocca 📍 accanto ai campi non risolti per selezionare un luogo.",
      );
      return;
    }
    const toCalc = isRoundTrip ? [...resolved, resolved[0]] : resolved;
    setCalculating(true);
    setRouteError(null);
    setWeatherPreview(null);
    try {
      const ghRoutingProfile = vehicleProfile === "auto_curvy" ? "auto_curvy" : vehicleProfile === "moto_fast" ? "motorcycle_fast" : vehicleProfile === "car" ? "car" : undefined;
      const result = await calcRoute(toCalc, style, drivingProfile, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, avoidWeather, roundTripHours, isRoundTrip, headingDeg, language, ghRoutingProfile, true, isRoundTrip ? undefined : segmentIntents ?? undefined);
      setRouteResult(result);
      setDismissedWarnings(new Set());
      if (result.durationMinutes > 480 && !isMultiDay) {
        const suggestedDays = Math.max(2, Math.min(14, Math.ceil(result.durationMinutes / (maxHoursPerDay * 60))));
        setIsMultiDay(true);
        setDaysCount(suggestedDays);
        Alert.alert(
          "Giro Multi-giorno",
          `Il percorso dura più di 8 ore (${Math.floor(result.durationMinutes / 60)}h ${result.durationMinutes % 60}m).\nAbbiamo attivato automaticamente il piano multi-giorno su ${suggestedDays} giorni.`,
          [{ text: "OK" }]
        );
      }
      autoLoadWeather(toCalc);
    } catch (err: unknown) {
      setRouteError((err instanceof Error ? err.message : null) ?? "Calcolo percorso fallito");
    } finally { setCalculating(false); }
  };

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const resp = await apiRequest("POST", "/api/planned-routes", data);
      return resp.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/planned-routes"] });
      router.replace(`/giri/${data.id}` as any);
    },
    onError: () => Alert.alert("Errore", "Impossibile salvare il giro.")
  });

  const handleSave = () => {
    if (!title.trim()) { Alert.alert("Errore", "Inserisci un titolo."); return; }
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < (isRoundTrip ? 1 : 2)) {
      Alert.alert("Errore", isRoundTrip ? "Seleziona almeno la partenza." : "Seleziona almeno 2 luoghi.");
      return;
    }

    const avgKmPerLiter = 18;
    const tankEstimateL = 15;
    const autonomyKm = Math.round(tankEstimateL * avgKmPerLiter * (fuelLevel / 100));
    const fuelStopsNeeded = routeResult ? Math.max(0, Math.ceil(routeResult.distanceKm / autonomyKm) - 1) : 0;

    saveMutation.mutate({
      title,
      // Il giro salvato mantiene esplicitamente la chiusura: A oppure A→ancore
      // diventano A→A oppure A→ancore→A anche fuori dal form di creazione.
      waypoints: isRoundTrip ? [...resolved, resolved[0]] : resolved,
      polyline: null,
      distanceKm: routeResult?.distanceKm ?? 0,
      durationMinutes: routeResult?.durationMinutes ?? 0,
      bikerScore: routeResult?.bikerScore ?? 0,
      navigationSteps: routeResult?.navigationSteps ?? null,
      style, visibility, isMultiDay,
      elevationGainM: routeResult?.elevationGainM ?? null,
      altitudeMinM: routeResult?.altitudeMinM ?? null,
      altitudeMaxM: routeResult?.altitudeMaxM ?? null,
      elevationProfile: routeResult?.elevationProfile ?? null,
      metadata: {
        avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, avoidWeather, daysCount, maxHoursPerDay,
        isRoundTrip, roundTripHours, headingDeg,
        segmentIntents,
        motorcycleId: selectedMotoId, fuelStopsNeeded,
        ...(aiProviderUsed ? { provider_used: aiProviderUsed } : {}),
      }
    });
  };

  const handleMapTap = useCallback(async (lat: number, lng: number) => {
    const coordName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    mapTapRequestId.current += 1;
    const myId = mapTapRequestId.current;
    setMapTapGeocoding(true);
    setPendingMapTap({ lat, lng, name: coordName });
    try {
      const resp = await apiRequest("GET", `/api/geocode/reverse?lat=${lat}&lon=${lng}`);
      const data = await resp.json() as { road?: string; suburb?: string; town?: string; city?: string; county?: string };
      const name = data.road ?? data.suburb ?? data.town ?? data.city ?? data.county ?? coordName;
      if (mapTapRequestId.current === myId) {
        setPendingMapTap({ lat, lng, name });
      }
    } catch {
      // intentional: geocoding failure is non-fatal
    } finally {
      if (mapTapRequestId.current === myId) {
        setMapTapGeocoding(false);
      }
    }
  }, []);

  const confirmMapTap = useCallback((role: "start" | "waypoint" | "end") => {
    if (!pendingMapTap) return;
    const { lat, lng, name } = pendingMapTap;
    const newWps = [...waypoints];
    const newInputs = [...wpInputs];
    if (role === "start") {
      newWps[0] = { lat, lng, name };
      newInputs[0] = name;
    } else if (role === "end") {
      newWps[newWps.length - 1] = { lat, lng, name };
      newInputs[newInputs.length - 1] = name;
    } else {
      const insertAt = Math.max(1, newWps.length - 1);
      newWps.splice(insertAt, 0, { lat, lng, name });
      newInputs.splice(insertAt, 0, name);
      setSegmentIntents((current) => {
        if (!current) return null;
        const next = [...current];
        next.splice(insertAt - 1, 0, { kind: "inherit" });
        next[insertAt] = { kind: "inherit" };
        return next;
      });
    }
    setWaypoints(newWps);
    setWpInputs(newInputs);
    setRouteResult(null);
    setWeatherPreview(null);
    setPendingMapTap(null);
  }, [pendingMapTap, waypoints, wpInputs]);

  const dismissMapTap = useCallback(() => {
    mapTapRequestId.current += 1;
    setPendingMapTap(null);
    setMapTapGeocoding(false);
  }, []);

  return {
    mode, setMode, aiPrompt, setAiPrompt, aiLoading, aiPreview, setAiPreview,
    title, setTitle, style, setStyle, drivingProfile, setDrivingProfile,
    isRoundTrip, setIsRoundTrip, roundTripHours, setRoundTripHours,
    headingDeg, setHeadingDeg, isMultiDay, setIsMultiDay, daysCount, setDaysCount,
    maxHoursPerDay, setMaxHoursPerDay, avoidHighways, setAvoidHighways,
    avoidTolls, setAvoidTolls, avoidFerries, setAvoidFerries,
    avoidUnpaved, setAvoidUnpaved, avoidWeather, setAvoidWeather,
    visibility, setVisibility, waypoints, setWaypoints, wpInputs, setWpInputs,
    segmentIntents, enableSegmentIntents, disableSegmentIntents, updateSegmentIntent,
    wpSuggestions, setWpSuggestions, wpLoading, routeResult, calculating,
    routeError, weatherPreview, weatherLoading, handleAiParse,
    updatePreviewItemName, regeocodePillItem, selectPreviewItemSuggestion, handleConfirmPreview, handleWpInput,
    selectSuggestion, addWaypoint, removeWaypoint, moveWaypoint, handleCalculate, handleSave,
    handleImportGpx, isImportingGpx, debugVisible, debugLogs, handleTitleTap,
    clearDebugLogs, fuelLevel, setFuelLevel, selectedMotoId, setSelectedMotoId,
    pendingMapTap, mapTapGeocoding, handleMapTap, confirmMapTap, dismissMapTap,
    resolvedPoiStops, selectPoiOption, clearPoiOption, aiProviderUsed,
    aiFallbackBanner, setAiFallbackBanner, aiBannerReason, aiSuccessBanner,
    setAiSuccessBanner, aiSuccessTimer,
    setRouteResult, setCalculating, bikerScoreAnim,
    lastFittedWaypointSig,
    saveMutationPending: saveMutation.isPending,
    dismissedWarnings, setDismissedWarnings, vehicleProfile, setVehicleProfile,
  };
}
