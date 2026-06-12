import { useState, useRef, useCallback } from "react";
import { Alert, Animated } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useApiDebugLog } from "@/hooks/useApiDebugLog";

import { 
  Waypoint, Style, DrivingProfile, VehicleProfile, Mode, RouteResult, 
  WeatherWaypoint, AiPreviewState, AiPreviewItem, COMPASS_DIRECTIONS,
  ResolvedPoiStop, PoiResult, GeoResult
} from "./types";
import { calcRoute, parseAI, clientFallbackAiParse, fetchWeatherPreview, AiKeyMissingError } from "./api";

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
  // Profilo veicolo: "moto" (default) o "auto_curvy" (auto panoramica via Valhalla).
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- geocoding suggestion results from API
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
  const lastFittedWaypointSig = useRef<string>("");
  const bikerScoreAnim = useRef(new Animated.Value(0)).current;
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

  const autoLoadWeather = async (wps: Waypoint[]) => {
    setWeatherLoading(true);
    try {
      const data = await fetchWeatherPreview(wps);
      setWeatherPreview(data.length > 0 ? data : null);
    } catch {
      setWeatherPreview(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  const handleImportGpx = useCallback(async () => {
    try {
      setIsImportingGpx(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/gpx+xml", "application/octet-stream", "*/*"],
        copyToCacheDirectory: true
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const gpxContent = await FileSystem.readAsStringAsync(asset.uri);
      const rawName = asset.name ?? "";
      const guessedTitle = rawName.replace(/\.gpx$/i, "").replace(/[_-]+/g, " ").trim();
      const url = new URL("/api/planned-routes/import-gpx", getApiUrl());
      const resp = await fetch(url.toString(), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gpxContent, title: guessedTitle || undefined })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as Error).message ?? "Importazione fallita");
      }
      const route = await resp.json() as { id: string };
      qc.invalidateQueries({ queryKey: ["/api/planned-routes"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      router.replace(`/giri/${route.id}` as any);
    } catch (err: unknown) {
      Alert.alert("Errore GPX", err instanceof Error ? (err as Error).message : "Impossibile leggere il file GPX.");
    } finally {
      setIsImportingGpx(false);
    }
  }, [router, qc]);

  const handleAiParse = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const result = await parseAI(aiPrompt);

      // Salva i poiStops risolti restituiti dal server (risultati Overpass + opzioni)
      if (result.resolvedPoiStops && Array.isArray(result.resolvedPoiStops)) {
        setResolvedPoiStops(
          result.resolvedPoiStops.map((s: { near: string; query: string; category: string; options: PoiResult[] }) => ({
            near: s.near,
            query: s.query,
            category: s.category,
            options: Array.isArray(s.options) ? s.options : [],
            selectedOption: s.options?.length === 1 ? s.options[0] : null,
          }))
        );
      } else {
        setResolvedPoiStops([]);
      }

      const rawLocations: Array<{ role: AiPreviewItem["role"]; name: string }> = [];
      if (result.startLocation) rawLocations.push({ role: "start", name: result.startLocation });
      for (const wp of (result.waypoints ?? [])) rawLocations.push({ role: "waypoint", name: wp });
      if (result.endLocation && result.endLocation !== result.startLocation) {
        rawLocations.push({ role: "end", name: result.endLocation });
      } else if (rawLocations.length > 0) {
        rawLocations.push({ role: "end", name: rawLocations[0].name });
      } else {
        rawLocations.push({ role: "end", name: "" });
      }
      if (rawLocations.length < 2) rawLocations.push({ role: "end", name: "" });

      const initialItems: AiPreviewItem[] = rawLocations.map((loc) => ({
        role: loc.role, name: loc.name, editedName: loc.name,
        lat: 0, lng: 0, geocoding: !!loc.name, resolved: false
      }));

      const preview: AiPreviewState = {
        title: result.title ?? "Giro in moto",
        style: result.style ?? "curvy",
        isRoundTrip: result.isRoundTrip ?? false,
        roundTripDirection: null,
        isMultiDay: result.isMultiDay ?? false,
        daysEstimate: result.daysEstimate ?? 2,
        avoidHighways: result.avoidHighways ?? false,
        items: initialItems,
        poiStops: Array.isArray(result.poiStops) ? result.poiStops : null,
      };
      if (result.provider_used) setAiProviderUsed(result.provider_used);
      setAiPreview(preview);
      setMode("ai-preview");
      if (aiSuccessTimer.current) clearTimeout(aiSuccessTimer.current);
      setAiSuccessBanner(true);
      aiSuccessTimer.current = setTimeout(() => setAiSuccessBanner(false), 3000);

      initialItems.forEach((item, idx) => {
        if (!item.name) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- geocode results from API
        logFetch<any[]>(
          "/api/planned-routes/geocode", "GET",
          () => { const url = new URL("/api/planned-routes/geocode", getApiUrl()); url.searchParams.set("q", item.name); return fetch(url.toString(), { credentials: "include" }); },
          async (resp) => { if (!resp.ok) return []; return resp.json(); }
        ).then((results) => {
          const best = results[0];
          setAiPreview((prev) => {
            if (!prev) return prev;
            const updatedItems = [...prev.items];
            updatedItems[idx] = { ...updatedItems[idx], lat: best ? best.lat : 0, lng: best ? best.lng : 0, geocoding: false, resolved: !!best };
            return { ...prev, items: updatedItems };
          });
        }).catch(() => {
          setAiPreview((prev) => {
            if (!prev) return prev;
            const updatedItems = [...prev.items];
            updatedItems[idx] = { ...updatedItems[idx], geocoding: false, resolved: false };
            return { ...prev, items: updatedItems };
          });
        });
      });
    } catch (err: unknown) {
      console.warn("[AI parse] fallback attivato:", (err instanceof Error ? err.message : null));
      setAiProviderUsed(null);
      const fallback = clientFallbackAiParse(aiPrompt);
      setTitle(fallback.title);
      setStyle(fallback.style as Style);
      setIsRoundTrip(fallback.isRoundTrip);
      setIsMultiDay(fallback.isMultiDay);
      setDaysCount(fallback.daysEstimate);
      setAvoidHighways(fallback.avoidHighways);
      setAiBannerReason(err instanceof AiKeyMissingError || (err as { code?: string })?.code === "AI_KEY_MISSING" ? "key_missing" : "generic");
      setAiFallbackBanner(true);
      setMode("manual");
    } finally {
      setAiLoading(false);
    }
  };

  const updatePreviewItemName = useCallback((idx: number, newName: string) => {
    setAiPreview((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], editedName: newName, lat: 0, lng: 0, resolved: false };
      return { ...prev, items };
    });
  }, []);

  const regeocodePillItem = useCallback((idx: number, name: string) => {
    if (!name.trim()) return;
    setAiPreview((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], geocoding: true };
      return { ...prev, items };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- geocode results from API
    logFetch<any[]>(
      "/api/planned-routes/geocode", "GET",
      () => { const url = new URL("/api/planned-routes/geocode", getApiUrl()); url.searchParams.set("q", name); return fetch(url.toString(), { credentials: "include" }); },
      async (resp) => { if (!resp.ok) return []; return resp.json(); }
    ).then((results) => {
      const best = results[0];
      setAiPreview((prev) => {
        if (!prev) return prev;
        const items = [...prev.items];
        items[idx] = { ...items[idx], lat: best ? best.lat : 0, lng: best ? best.lng : 0, geocoding: false, resolved: !!best };
        return { ...prev, items };
      });
    }).catch(() => {
      setAiPreview((prev) => {
        if (!prev) return prev;
        const items = [...prev.items];
        items[idx] = { ...items[idx], geocoding: false, resolved: false };
        return { ...prev, items };
      });
    });
  }, [logFetch]);

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

  const handleConfirmPreview = async () => {
    if (!aiPreview) return;
    const geoWps: Waypoint[] = aiPreview.items.map((item) => ({
      lat: item.lat, lng: item.lng, name: item.editedName || item.name
    }));
    // Inserisce i POI selezionati come waypoint intermedi (prima dell'arrivo)
    const poiWps: Waypoint[] = resolvedPoiStops
      .filter((s) => s.selectedOption !== null)
      .map((s) => ({ lat: s.selectedOption!.lat, lng: s.selectedOption!.lng, name: s.selectedOption!.name }));
    const newWps: Waypoint[] = geoWps.length >= 2
      ? [...geoWps.slice(0, -1), ...poiWps, geoWps[geoWps.length - 1]]
      : [...geoWps, ...poiWps];
    const newInputs = newWps.map((wp) => wp.name);
    setTitle(aiPreview.title);
    setStyle(aiPreview.style);
    setIsRoundTrip(aiPreview.isRoundTrip);
    const dirDeg = COMPASS_DIRECTIONS.find((d) => d.label === (aiPreview.roundTripDirection ?? ""))?.deg ?? null;
    setHeadingDeg(dirDeg);
    setIsMultiDay(aiPreview.isMultiDay);
    setDaysCount(aiPreview.daysEstimate);
    setAvoidHighways(aiPreview.avoidHighways);
    setWaypoints(newWps);
    setWpInputs(newInputs);
    setMode("manual");

    const resolved = newWps.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) return;
    const toCalc = aiPreview.isRoundTrip ? [...resolved, resolved[0]] : resolved;
    setCalculating(true);
    setRouteResult(null);
    setWeatherPreview(null);
    try {
      const result = await logFetch<RouteResult>(
        "/api/planned-routes/calculate", "POST",
        () => {
          const url = new URL("/api/planned-routes/calculate", getApiUrl());
          return fetch(url.toString(), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waypoints: toCalc, style: aiPreview.style, drivingProfile, avoidHighways: aiPreview.avoidHighways, avoidTolls: false, isRoundTrip: aiPreview.isRoundTrip, roundTripDirection: aiPreview.roundTripDirection ?? null, language, ...(vehicleProfile === "auto_curvy" ? { routingProfile: "auto_curvy" } : {}) }) });
        },
        async (resp) => { if (!resp.ok) { const b = await resp.json().catch(() => ({})); throw new Error(b.message ?? "Calcolo fallito"); } return resp.json(); }
      );
      setRouteResult(result);
      setDismissedWarnings(new Set());
      if (result.durationMinutes > 480 && !aiPreview.isMultiDay) {
        const suggestedDays = Math.max(2, Math.min(14, Math.ceil(result.durationMinutes / (maxHoursPerDay * 60))));
        setIsMultiDay(true);
        setDaysCount(suggestedDays);
        Alert.alert("Giro Multi-giorno", `Il percorso dura più di 8 ore.\nAbbiamo attivato il piano multi-giorno su ${suggestedDays} giorni.`, [{ text: "OK" }]);
      }
      autoLoadWeather(toCalc);
    } catch (err: unknown) {
      Alert.alert("Calcolo automatico fallito", `${(err instanceof Error ? err.message : null) ?? "Errore"}\nModifica le tappe e premi "Calcola percorso" manualmente.`);
    } finally {
      setCalculating(false);
    }
  };

  const handleWpInput = (text: string, index: number) => {
    const newInputs = [...wpInputs]; newInputs[index] = text; setWpInputs(newInputs);
    const newWps = [...waypoints]; newWps[index] = { ...newWps[index], name: text, lat: 0, lng: 0 }; setWaypoints(newWps);
    setRouteResult(null);
    if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    // Evict stale cache entries for this waypoint slot when the user types new text
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
          const results = await logFetch<GeoResult[]>(
            "/api/planned-routes/geocode", "GET",
            () => { const url = new URL("/api/planned-routes/geocode", getApiUrl()); url.searchParams.set("q", text); return fetch(url.toString(), { credentials: "include" }); },
            async (resp) => {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- geo suggestion from geocode API
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
    setRouteResult(null);
  };

  const removeWaypoint = (index: number) => {
    if (waypoints.length <= 2) return;
    setWaypoints(waypoints.filter((_, i) => i !== index));
    setWpInputs(wpInputs.filter((_, i) => i !== index));
    setRouteResult(null);
  };

  const handleCalculate = async () => {
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) {
      Alert.alert("Waypoint non risolti", "Tocca 📍 accanto ai campi non risolti per selezionare un luogo."); return;
    }
    const toCalc = isRoundTrip ? [...resolved, resolved[0]] : resolved;
    setCalculating(true);
    setRouteError(null);
    setWeatherPreview(null);
    try {
      const result = await calcRoute(toCalc, style, drivingProfile, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, avoidWeather, roundTripHours, isRoundTrip, headingDeg, language, vehicleProfile === "auto_curvy" ? "auto_curvy" : undefined);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- route data payload
    mutationFn: async (data: any) => {
      const resp = await apiRequest("POST", "/api/planned-routes", data);
      return resp.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/planned-routes"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      router.replace(`/giri/${data.id}` as any);
    },
    onError: () => Alert.alert("Errore", "Impossibile salvare il giro.")
  });

  const handleSave = () => {
    if (!title.trim()) { Alert.alert("Errore", "Inserisci un titolo."); return; }
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) { Alert.alert("Errore", "Seleziona almeno 2 luoghi."); return; }

    const avgKmPerLiter = 18;
    const tankEstimateL = 15;
    const autonomyKm = Math.round(tankEstimateL * avgKmPerLiter * (fuelLevel / 100));
    const fuelStopsNeeded = routeResult ? Math.max(0, Math.ceil(routeResult.distanceKm / autonomyKm) - 1) : 0;

    saveMutation.mutate({
      title,
      waypoints: resolved,
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
      // keep coordName as fallback (only if still the latest request)
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
    debugLogs, clearDebugLogs, debugVisible, setDebugVisible, handleTitleTap,
    isImportingGpx, handleImportGpx,
    mode, setMode, aiPrompt, setAiPrompt, aiLoading, handleAiParse,
    aiPreview, setAiPreview, aiFallbackBanner, setAiFallbackBanner, aiBannerReason,
    aiSuccessBanner, setAiSuccessBanner, aiSuccessTimer,
    title, setTitle, style, setStyle, drivingProfile, setDrivingProfile,
    vehicleProfile, setVehicleProfile,
    isRoundTrip, setIsRoundTrip, roundTripHours, setRoundTripHours,
    headingDeg, setHeadingDeg, isMultiDay, setIsMultiDay,
    daysCount, setDaysCount, maxHoursPerDay, setMaxHoursPerDay,
    avoidHighways, setAvoidHighways, avoidTolls, setAvoidTolls,
    avoidFerries, setAvoidFerries, avoidUnpaved, setAvoidUnpaved,
    avoidWeather, setAvoidWeather,
    visibility, setVisibility, selectedMotoId, setSelectedMotoId,
    fuelLevel, setFuelLevel, waypoints, setWaypoints,
    wpInputs, setWpInputs, wpSuggestions, setWpSuggestions, wpLoading,
    routeResult, setRouteResult, calculating, setCalculating,
    dismissedWarnings, setDismissedWarnings,
    weatherPreview, setWeatherPreview, weatherLoading, setWeatherLoading,
    lastFittedWaypointSig, bikerScoreAnim,
    updatePreviewItemName, regeocodePillItem, handleConfirmPreview,
    handleWpInput, selectSuggestion, addWaypoint, removeWaypoint,
    handleCalculate, handleSave, saveMutationPending: saveMutation.isPending,
    handleMapTap, aiProviderUsed,
    routeError, setRouteError,
    resolvedPoiStops, selectPoiOption, clearPoiOption,
    pendingMapTap, mapTapGeocoding, confirmMapTap, dismissMapTap,
  };
}
