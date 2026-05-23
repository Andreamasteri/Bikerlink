import { useState, useRef, useCallback } from "react";
import { Alert, Animated } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useApiDebugLog } from "@/hooks/useApiDebugLog";
import { 
  Waypoint, Style, DrivingProfile, Mode, RouteResult, 
  WeatherWaypoint, AiPreviewState, AiPreviewItem, COMPASS_DIRECTIONS 
} from "./types";
import { calcRoute, parseAI, clientFallbackAiParse, fetchWeatherPreview } from "./api";

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
  const [aiFallbackBanner, setAiFallbackBanner] = useState(false);
  const [aiSuccessBanner, setAiSuccessBanner] = useState(false);
  const aiSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [title, setTitle] = useState("Giro in moto");
  const [style, setStyle] = useState<Style>("curvy");
  const [drivingProfile, setDrivingProfile] = useState<DrivingProfile>("geometric");
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
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [selectedMotoId, setSelectedMotoId] = useState<string | null>(null);
  const [fuelLevel, setFuelLevel] = useState<number>(100);

  const [waypoints, setWaypoints] = useState<Waypoint[]>([{ lat: 0, lng: 0, name: "" }, { lat: 0, lng: 0, name: "" }]);
  const [wpInputs, setWpInputs] = useState<string[]>(["", ""]);
  const [wpSuggestions, setWpSuggestions] = useState<{ index: number; results: any[] } | null>(null);

  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  const [weatherPreview, setWeatherPreview] = useState<WeatherWaypoint[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const suggestionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFittedWaypointSig = useRef<string>("");
  const bikerScoreAnim = useRef(new Animated.Value(0)).current;

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
        copyToCacheDirectory: true,
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
        body: JSON.stringify({ gpxContent, title: guessedTitle || undefined }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message ?? "Importazione fallita");
      }
      const route = await resp.json() as { id: string };
      qc.invalidateQueries({ queryKey: ["/api/planned-routes"] });
      router.replace(`/giri/${route.id}` as any);
    } catch (err: unknown) {
      Alert.alert("Errore GPX", err instanceof Error ? err.message : "Impossibile leggere il file GPX.");
    } finally {
      setIsImportingGpx(false);
    }
  }, [router, qc]);

  const handleAiParse = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const result = await parseAI(aiPrompt);
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
        lat: 0, lng: 0, geocoding: !!loc.name, resolved: false,
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
      };
      setAiPreview(preview);
      setMode("ai-preview");
      if (aiSuccessTimer.current) clearTimeout(aiSuccessTimer.current);
      setAiSuccessBanner(true);
      aiSuccessTimer.current = setTimeout(() => setAiSuccessBanner(false), 3000);

      initialItems.forEach((item, idx) => {
        if (!item.name) return;
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
    } catch (err: any) {
      console.warn("[AI parse] fallback attivato:", err?.message);
      const fallback = clientFallbackAiParse(aiPrompt);
      setTitle(fallback.title);
      setStyle(fallback.style as Style);
      setIsRoundTrip(fallback.isRoundTrip);
      setIsMultiDay(fallback.isMultiDay);
      setDaysCount(fallback.daysEstimate);
      setAvoidHighways(fallback.avoidHighways);
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

  const handleConfirmPreview = async () => {
    if (!aiPreview) return;
    const newWps: Waypoint[] = aiPreview.items.map((item) => ({
      lat: item.lat, lng: item.lng, name: item.editedName || item.name,
    }));
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
          return fetch(url.toString(), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waypoints: toCalc, style: aiPreview.style, drivingProfile, avoidHighways: aiPreview.avoidHighways, avoidTolls: false, isRoundTrip: aiPreview.isRoundTrip, roundTripDirection: aiPreview.roundTripDirection ?? null, language }) });
        },
        async (resp) => { if (!resp.ok) throw new Error("Calcolo fallito"); return resp.json(); }
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
    } catch (err: any) {
      Alert.alert("Calcolo automatico fallito", `${err?.message ?? "Errore"}\nModifica le tappe e premi "Calcola percorso" manualmente.`);
    } finally {
      setCalculating(false);
    }
  };

  const handleWpInput = (text: string, index: number) => {
    const newInputs = [...wpInputs]; newInputs[index] = text; setWpInputs(newInputs);
    const newWps = [...waypoints]; newWps[index] = { ...newWps[index], name: text, lat: 0, lng: 0 }; setWaypoints(newWps);
    setRouteResult(null);
    if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    if (text.length >= 3) {
      suggestionTimeout.current = setTimeout(async () => {
        const results = await logFetch<any[]>(
          "/api/planned-routes/geocode", "GET",
          () => { const url = new URL("/api/planned-routes/geocode", getApiUrl()); url.searchParams.set("q", text); return fetch(url.toString(), { credentials: "include" }); },
          async (resp) => { if (!resp.ok) return []; return resp.json(); }
        );
        setWpSuggestions({ index, results });
      }, 600);
    } else { setWpSuggestions(null); }
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
      Alert.alert("Waypoint non risolti", "Seleziona almeno 2 luoghi dalla lista suggerimenti."); return;
    }
    const toCalc = isRoundTrip ? [...resolved, resolved[0]] : resolved;
    setCalculating(true);
    setWeatherPreview(null);
    try {
      const result = await calcRoute(toCalc, style, drivingProfile, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, roundTripHours, isRoundTrip, headingDeg, language);
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
    } catch (err: any) {
      Alert.alert("Errore", err?.message ?? "Calcolo percorso fallito");
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
    onError: () => Alert.alert("Errore", "Impossibile salvare il giro."),
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
        avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, daysCount, maxHoursPerDay,
        isRoundTrip, roundTripHours, headingDeg,
        motorcycleId: selectedMotoId, fuelStopsNeeded,
      },
    });
  };

  const handleMapTap = async (lat: number, lng: number) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=it`;
      const resp = await fetch(url, { headers: { "User-Agent": "BikerLink/4.0 (info@bikerlink.it)" } });
      let name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      if (resp.ok) {
        const data = await resp.json() as any;
        const d = data.address ?? {};
        name = d.road ?? d.suburb ?? d.town ?? d.city ?? d.county ?? name;
      }
      const newWps = [...waypoints];
      const newInputs = [...wpInputs];
      const emptyIdx = newWps.findIndex((w) => w.lat === 0 && w.lng === 0);
      if (emptyIdx !== -1) {
        newWps[emptyIdx] = { lat, lng, name };
        newInputs[emptyIdx] = name;
      } else {
        const insertAt = Math.max(0, newWps.length - 1);
        newWps.splice(insertAt, 0, { lat, lng, name });
        newInputs.splice(insertAt, 0, name);
      }
      setWaypoints(newWps);
      setWpInputs(newInputs);
      setRouteResult(null);
      setWeatherPreview(null);
    } catch {
      // no-op: ignore reverse geocoding failures on map tap
    }
  };

  return {
    debugLogs, clearDebugLogs, debugVisible, setDebugVisible, handleTitleTap,
    isImportingGpx, handleImportGpx,
    mode, setMode, aiPrompt, setAiPrompt, aiLoading, handleAiParse,
    aiPreview, setAiPreview, aiFallbackBanner, setAiFallbackBanner,
    aiSuccessBanner, setAiSuccessBanner, aiSuccessTimer,
    title, setTitle, style, setStyle, drivingProfile, setDrivingProfile,
    isRoundTrip, setIsRoundTrip, roundTripHours, setRoundTripHours,
    headingDeg, setHeadingDeg, isMultiDay, setIsMultiDay,
    daysCount, setDaysCount, maxHoursPerDay, setMaxHoursPerDay,
    avoidHighways, setAvoidHighways, avoidTolls, setAvoidTolls,
    avoidFerries, setAvoidFerries, avoidUnpaved, setAvoidUnpaved,
    visibility, setVisibility, selectedMotoId, setSelectedMotoId,
    fuelLevel, setFuelLevel, waypoints, setWaypoints,
    wpInputs, setWpInputs, wpSuggestions, setWpSuggestions,
    routeResult, setRouteResult, calculating, setCalculating,
    dismissedWarnings, setDismissedWarnings,
    weatherPreview, setWeatherPreview, weatherLoading, setWeatherLoading,
    lastFittedWaypointSig, bikerScoreAnim,
    updatePreviewItemName, regeocodePillItem, handleConfirmPreview,
    handleWpInput, selectSuggestion, addWaypoint, removeWaypoint,
    handleCalculate, handleSave, saveMutationPending: saveMutation.isPending,
    handleMapTap
  };
}
