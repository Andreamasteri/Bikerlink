import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Switch,
  Animated,
} from "react-native";
import WebView from "react-native-webview";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { buildPlannerMapHtml } from "@/lib/leaflet-route-map-html";
import { getTileConfig } from "@/lib/map-tiles";
import { useApiDebugLog } from "@/hooks/useApiDebugLog";
import DebugPanel from "@/components/DebugPanel";
import ElevationProfile from "@/components/ElevationProfile";
import { decodePolyline } from "@/lib/polyline";

type Style = "direct" | "fast" | "balanced" | "curvy" | "extra_curvy";
type Mode = "ai" | "ai-preview" | "manual";
type CompassDir = "N" | "NE" | "E" | "SE" | "S" | "SO" | "O" | "NO";

interface Waypoint { lat: number; lng: number; name: string; }
interface GeoResult { name: string; lat: number; lng: number; }
interface RouteResult {
  encoded?: string | null;
  rawPoints?: Array<{ lat: number; lng: number }> | null;
  distanceKm: number;
  durationMinutes: number;
  bikerScore: number;
  approximate?: boolean;
  navigationSteps?: Array<{ sign: number; text: string; distance: number; interval: [number, number]; streetName?: string }> | null;
  elevationProfile?: Array<{ distanceKm: number; altitudeM: number }> | null;
  elevationGainM?: number | null;
  altitudeMinM?: number | null;
  altitudeMaxM?: number | null;
}

interface WeatherWaypoint {
  lat: number; lng: number; name: string;
  tempNow: number | null; precipProb: number; weatherCode: number;
  weatherDesc: string; isSuitable: boolean;
}

interface UserMotorcycle { id: string; brand: string; model: string; year?: number | null; ridingStyle?: string | null; }

interface AiPreviewItem {
  role: "start" | "waypoint" | "end";
  name: string;
  editedName: string;
  lat: number;
  lng: number;
  geocoding: boolean;
  resolved: boolean;
}

interface AiPreviewState {
  title: string;
  style: Style;
  isRoundTrip: boolean;
  roundTripDirection: CompassDir | null;
  isMultiDay: boolean;
  daysEstimate: number;
  avoidHighways: boolean;
  items: AiPreviewItem[];
}


const STYLE_LEVELS: { key: Style; label: string; shortLabel: string }[] = [
  { key: "direct", label: "Diretto", shortLabel: "Diretto" },
  { key: "fast", label: "Veloce", shortLabel: "Veloce" },
  { key: "balanced", label: "Bilanciato", shortLabel: "Bilanc." },
  { key: "curvy", label: "Curvy", shortLabel: "Curvy" },
  { key: "extra_curvy", label: "Extra Curvy", shortLabel: "Extra +" },
];

const COMPASS_DIRECTIONS: { label: string; deg: number }[] = [
  { label: "N", deg: 0 },
  { label: "NE", deg: 45 },
  { label: "E", deg: 90 },
  { label: "SE", deg: 135 },
  { label: "S", deg: 180 },
  { label: "SO", deg: 225 },
  { label: "O", deg: 270 },
  { label: "NO", deg: 315 },
];

async function geocode(q: string): Promise<GeoResult[]> {
  const url = new URL("/api/planned-routes/geocode", getApiUrl());
  url.searchParams.set("q", q);
  const resp = await fetch(url.toString(), { credentials: "include" });
  if (!resp.ok) return [];
  return resp.json();
}

async function calcRoute(
  waypoints: Waypoint[],
  style: Style,
  avoidHighways: boolean,
  avoidTolls: boolean,
  avoidFerries: boolean,
  avoidUnpaved: boolean,
  roundTripHours?: number,
  isRoundTrip?: boolean,
  headingDeg?: number | null,
): Promise<RouteResult> {
  const url = new URL("/api/planned-routes/calculate", getApiUrl());
  const resp = await fetch(url.toString(), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      waypoints, style, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved,
      roundTripHours, isRoundTrip,
      ...(headingDeg !== null && headingDeg !== undefined ? { headingDeg } : {}),
    }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message ?? "Calcolo percorso fallito");
  }
  return resp.json();
}

async function parseAI(prompt: string): Promise<any> {
  const url = new URL("/api/planned-routes/ai-parse", getApiUrl());
  const resp = await fetch(url.toString(), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message ?? "Servizio AI non disponibile");
  }
  return resp.json();
}

async function fetchWeatherPreview(waypoints: Waypoint[]): Promise<WeatherWaypoint[]> {
  const url = new URL("/api/planned-routes/weather", getApiUrl());
  const resp = await fetch(url.toString(), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      waypoints: waypoints.filter((w) => w.lat !== 0 || w.lng !== 0),
      departureTime: new Date(Date.now() + 3600_000).toISOString(),
    }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.waypoints ?? []).filter(Boolean);
}

function weatherIcon(code: number): keyof typeof Ionicons.glyphMap {
  if (code === 0) return "sunny-outline";
  if (code <= 3) return "partly-sunny-outline";
  if (code <= 59) return "rainy-outline";
  if (code <= 79) return "snow-outline";
  if (code <= 99) return "thunderstorm-outline";
  return "cloud-outline";

}
export default function GiriCreateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const topPad = insets.top;

  const { logs: debugLogs, clearLogs: clearDebugLogs, logFetch } = useApiDebugLog();
  const [debugVisible, setDebugVisible] = useState(__DEV__);
  const titleTapCount = useRef(0);
  const titleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const [mode, setMode] = useState<Mode>("ai");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);

  const [title, setTitle] = useState("Giro in moto");
  const [style, setStyle] = useState<Style>("curvy");
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
  const [wpSuggestions, setWpSuggestions] = useState<{ index: number; results: GeoResult[] } | null>(null);

  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  const [weatherPreview, setWeatherPreview] = useState<WeatherWaypoint[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const suggestionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCalcTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webviewRef = useRef<WebView | null>(null);

  // BikerScore animation
  const bikerScoreAnim = useRef(new Animated.Value(0)).current;
  const prevBikerScore = useRef(0);

  const TILE = getTileConfig("carto_dark");

  const isApproxRoute = !!routeResult && (!!routeResult.approximate || !routeResult.encoded);

  const compassDirLabel: string | null =
    mode === "ai"
      ? (aiPreview?.roundTripDirection ?? null)
      : (COMPASS_DIRECTIONS.find((d) => d.deg === headingDeg)?.label ?? null);

  // Route polyline is injected via JS (window.updateRouteWithCurvature) — not baked into HTML.
  // This avoids full WebView reloads on every auto-recalculate.
  const plannerMapHtml = useMemo(() => {
    return buildPlannerMapHtml(
      TILE.urlTemplate,
      TILE.maximumZ,
      colors.accent,
      waypoints,
      undefined,
      compassDirLabel
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, colors.accent]);

  useEffect(() => {
    const js = `(function(){ if(typeof window.updateCompassDirection==='function'){ window.updateCompassDirection(${JSON.stringify(compassDirLabel)}); } })(); true;`;
    webviewRef.current?.injectJavaScript(js);
  }, [compassDirLabel]);

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
    } catch {}
  };

  const { data: motorcycles = [] } = useQuery<UserMotorcycle[]>({
    queryKey: ["/api/motorcycles"],
  });

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

      initialItems.forEach((item, idx) => {
        if (!item.name) return;
        logFetch<GeoResult[]>(
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
      Alert.alert("Errore AI", err?.message ?? "Servizio AI non disponibile");
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
    logFetch<GeoResult[]>(
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
  }, []);

  const handleConfirmPreview = async () => {
    if (!aiPreview) return;
    const newWps: Waypoint[] = aiPreview.items.map((item) => ({
      lat: item.lat, lng: item.lng, name: item.editedName || item.name,
    }));
    const newInputs = newWps.map((wp) => wp.name);
    setTitle(aiPreview.title);
    setStyle(aiPreview.style);
    setIsRoundTrip(aiPreview.isRoundTrip);
    setRoundTripDirection(aiPreview.roundTripDirection ?? null);
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
          return fetch(url.toString(), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waypoints: toCalc, style: aiPreview.style, avoidHighways: aiPreview.avoidHighways, avoidTolls: false, isRoundTrip: aiPreview.isRoundTrip, roundTripDirection: aiPreview.roundTripDirection ?? null }) });
        },
        async (resp) => { if (!resp.ok) throw new Error("Calcolo fallito"); return resp.json(); }
      );
      setRouteResult(result);
      if (result.durationMinutes > 480 && !aiPreview.isMultiDay) {
        const suggestedDays = Math.max(2, Math.min(14, Math.ceil(result.durationMinutes / (maxHoursPerDay * 60))));
        setIsMultiDay(true);
        setDaysCount(suggestedDays);
        Alert.alert("Giro Multi-giorno", `Il percorso dura più di 8 ore.\nAbbiamo attivato il piano multi-giorno su ${suggestedDays} giorni.`, [{ text: "OK" }]);
      }
      // Auto-load weather preview
      autoLoadWeather(toCalc);
    } catch (err: any) {
      Alert.alert("Calcolo automatico fallito", `${err?.message ?? "Errore"}\nModifica le tappe e premi "Calcola percorso" manualmente.`);
    } finally {
      setCalculating(false);
    }
  };

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

  const handleWpInput = (text: string, index: number) => {
    const newInputs = [...wpInputs]; newInputs[index] = text; setWpInputs(newInputs);
    const newWps = [...waypoints]; newWps[index] = { ...newWps[index], name: text, lat: 0, lng: 0 }; setWaypoints(newWps);
    setRouteResult(null);
    if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    if (text.length >= 3) {
      suggestionTimeout.current = setTimeout(async () => {
        const results = await logFetch<GeoResult[]>(
          "/api/planned-routes/geocode", "GET",
          () => { const url = new URL("/api/planned-routes/geocode", getApiUrl()); url.searchParams.set("q", text); return fetch(url.toString(), { credentials: "include" }); },
          async (resp) => { if (!resp.ok) return []; return resp.json(); }
        );
        setWpSuggestions({ index, results });
      }, 600);
    } else { setWpSuggestions(null); }
  };

  const selectSuggestion = (index: number, geo: GeoResult) => {
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

  // ── Animate BikerScore bar when value changes ─────────────────────────────
  useEffect(() => {
    const score = routeResult ? Math.round(routeResult.bikerScore * 100) : 0;
    Animated.spring(bikerScoreAnim, {
      toValue: score,
      useNativeDriver: false,
      tension: 60,
      friction: 10,
    }).start();
    prevBikerScore.current = score;
  }, [routeResult?.bikerScore]);

  // ── Inject curvature gradient into WebView whenever routeResult updates ───
  useEffect(() => {
    if (!routeResult || !webviewRef.current) return;
    let pts: Array<{ lat: number; lng: number }> = [];
    if (routeResult.encoded) {
      pts = decodePolyline(routeResult.encoded);
    } else if (routeResult.rawPoints) {
      pts = routeResult.rawPoints.map(({ lat, lng }) => ({ lat, lng }));
    }
    if (pts.length < 2) return;
    const ptsJson = JSON.stringify(pts);
    // fitMap=false: avoid jarring re-pan on every live update
    const js = `(function(){ if(typeof window.updateRouteWithCurvature==='function'){ window.updateRouteWithCurvature(${ptsJson}, false); } })(); true;`;
    webviewRef.current.injectJavaScript(js);
  }, [routeResult?.encoded, routeResult?.rawPoints]);

  // ── Debounced auto-recalculate when resolved waypoints change ─────────────
  useEffect(() => {
    if (mode !== "manual") return;
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) return;
    if (autoCalcTimeout.current) clearTimeout(autoCalcTimeout.current);
    autoCalcTimeout.current = setTimeout(async () => {
      const toCalc = isRoundTrip ? [...resolved, resolved[0]] : resolved;
      setCalculating(true);
      try {
        const result = await calcRoute(toCalc, style, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, roundTripHours, isRoundTrip, headingDeg);
        setRouteResult(result);
      } catch {
        // silent — user can still trigger manually
      } finally {
        setCalculating(false);
      }
    }, 500);
    return () => { if (autoCalcTimeout.current) clearTimeout(autoCalcTimeout.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, style, avoidHighways, avoidTolls, isRoundTrip, roundTripHours, headingDeg, mode]);

  const handleCalculate = async () => {
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) {
      Alert.alert("Waypoint non risolti", "Seleziona almeno 2 luoghi dalla lista suggerimenti."); return;
    }
    const toCalc = isRoundTrip ? [...resolved, resolved[0]] : resolved;
    setCalculating(true);
    setWeatherPreview(null);
    try {
      const result = await calcRoute(toCalc, style, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, roundTripHours, isRoundTrip, headingDeg);
      setRouteResult(result);
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
      // Auto-load weather preview
      autoLoadWeather(toCalc);
    } catch (err: any) {
      Alert.alert("Errore", err?.message ?? "Calcolo percorso fallito");
    } finally { setCalculating(false); }
  };

  const selectedMoto = motorcycles.find((m) => m.id === selectedMotoId);
  const avgKmPerLiter = 18;
  const tankEstimateL = 15;
  const autonomyKm = Math.round(tankEstimateL * avgKmPerLiter * (fuelLevel / 100));
  const fuelStopsNeeded = routeResult ? Math.max(0, Math.ceil(routeResult.distanceKm / autonomyKm) - 1) : 0;

  const handleSave = () => {
    if (!title.trim()) { Alert.alert("Errore", "Inserisci un titolo."); return; }
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) { Alert.alert("Errore", "Seleziona almeno 2 luoghi."); return; }

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

  const pillRoleLabel = (role: AiPreviewItem["role"]) => {
    if (role === "start") return "Partenza";
    if (role === "end") return "Arrivo";
    return "Tappa";
  };
  const pillRoleColor = (role: AiPreviewItem["role"]) => {
    if (role === "start") return "#22c55e";
    if (role === "end") return colors.accentRed;
    return colors.accent;
  };

  const s = styles(colors);

  const styleSliderIndex = STYLE_LEVELS.findIndex((sl) => sl.key === style);

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <View style={s.nav}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Pressable onPress={handleTitleTap} hitSlop={8}>
          <Text style={s.navTitle}>Pianifica Giro</Text>
        </Pressable>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Mode selector */}
        <View style={s.modeRow}>
          {(["ai", "manual"] as const).map((m) => (
            <Pressable
              key={m}
              style={[s.modeChip, (mode === m || (mode === "ai-preview" && m === "ai")) && { backgroundColor: colors.accent }]}
              onPress={() => setMode(m)}
            >
              <Ionicons name={m === "ai" ? "sparkles" : "create-outline"} size={14} color={(mode === m || (mode === "ai-preview" && m === "ai")) ? "#000" : colors.text} />
              <Text style={[s.modeChipText, (mode === m || (mode === "ai-preview" && m === "ai")) && { color: "#000" }]}>{m === "ai" ? "AI" : "Manuale"}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── AI INPUT mode ─────────────────────────────────────────────────── */}
        {mode === "ai" && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Descrivi il tuo giro</Text>
            <TextInput
              style={s.aiInput}
              placeholder={"Es: 3 ore di curve sulle Alpi partendo da Milano,\nevitando autostrade, ritorno incluso"}
              placeholderTextColor={colors.textSecondary}
              value={aiPrompt} onChangeText={setAiPrompt}
              multiline numberOfLines={4} textAlignVertical="top"
            />
            <Pressable
              style={[s.primaryBtn, (aiLoading || !aiPrompt.trim()) && { opacity: 0.6 }]}
              onPress={handleAiParse} disabled={aiLoading || !aiPrompt.trim()}
            >
              {aiLoading ? <ActivityIndicator color="#000" size="small" /> : <Ionicons name="sparkles" size={18} color="#000" />}
              <Text style={s.primaryBtnText}>{aiLoading ? "Elaborazione..." : "Genera con AI"}</Text>
            </Pressable>
            <Text style={s.hint}>L'AI interpreterà la tua richiesta e compilerà automaticamente il percorso</Text>
          </View>
        )}

        {/* ── AI PREVIEW mode ───────────────────────────────────────────────── */}
        {mode === "ai-preview" && aiPreview && (
          <View style={s.section}>
            <View style={s.previewHeader}>
              <Ionicons name="sparkles" size={18} color={colors.accent} />
              <Text style={s.previewHeaderText}>Anteprima giro generata dall'AI</Text>
            </View>
            <Text style={s.previewHint}>Tocca un pill per modificarlo, poi conferma per calcolare il percorso</Text>

            <View style={s.pillSection}>
              <Text style={s.pillLabel}>TITOLO</Text>
              <View style={[s.pill, { borderColor: colors.border }]}>
                <Ionicons name="bookmark-outline" size={14} color={colors.textSecondary} />
                <TextInput
                  style={s.pillInput}
                  value={aiPreview.title}
                  onChangeText={(t) => setAiPreview((p) => p ? { ...p, title: t } : p)}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>

            <View style={s.pillSection}>
              <Text style={s.pillLabel}>STILE PERCORSO</Text>
              <View style={s.pillRow}>
                {(["curvy", "balanced", "fast"] as Style[]).map((st) => (
                  <Pressable
                    key={st}
                    style={[s.stylePill, aiPreview.style === st && { backgroundColor: colors.accent + "33", borderColor: colors.accent }]}
                    onPress={() => setAiPreview((p) => p ? { ...p, style: st } : p)}
                  >
                    <MaterialCommunityIcons
                      name={st === "curvy" ? "road-variant" : st === "fast" ? "rocket-launch-outline" : "scale-balance"}
                      size={14}
                      color={aiPreview.style === st ? colors.accent : colors.textSecondary}
                    />
                    <Text style={[s.stylePillText, aiPreview.style === st && { color: colors.accent }]}>
                      {st === "curvy" ? "Curve" : st === "fast" ? "Veloce" : "Bilanciato"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={s.pillSection}>
              <Text style={s.pillLabel}>TAPPE</Text>
              {aiPreview.items.map((item, idx) => (
                <View key={idx} style={s.locationPillRow}>
                  <View style={[s.locationPillDot, { backgroundColor: pillRoleColor(item.role) }]} />
                  <View style={[
                    s.locationPill,
                    item.resolved && { borderColor: "#22c55e55" },
                    !item.resolved && !item.geocoding && item.editedName && { borderColor: colors.accentRed + "55" },
                  ]}>
                    <Text style={[s.locationPillRole, { color: pillRoleColor(item.role) }]}>{pillRoleLabel(item.role)}</Text>
                    <TextInput
                      style={s.locationPillInput}
                      value={item.editedName}
                      onChangeText={(t) => updatePreviewItemName(idx, t)}
                      onBlur={() => regeocodePillItem(idx, item.editedName)}
                      placeholderTextColor={colors.textSecondary}
                      placeholder="Inserisci luogo..."
                    />
                    {item.geocoding && <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 4 }} />}
                    {!item.geocoding && item.resolved && <Ionicons name="checkmark-circle" size={16} color="#22c55e" />}
                    {!item.geocoding && !item.resolved && item.editedName.length > 0 && (
                      <Ionicons name="alert-circle-outline" size={16} color={colors.accentRed} />
                    )}
                  </View>
                </View>
              ))}
            </View>

            <View style={s.pillSection}>
              <Text style={s.pillLabel}>OPZIONI</Text>
              <View style={s.optionPillRow}>
                <Pressable
                  style={[s.optionPill, aiPreview.isRoundTrip && { backgroundColor: colors.accent + "22", borderColor: colors.accent }]}
                  onPress={() => setAiPreview((p) => p ? { ...p, isRoundTrip: !p.isRoundTrip, roundTripDirection: !p.isRoundTrip ? p.roundTripDirection : null } : p)}
                >
                  <Ionicons name="repeat-outline" size={14} color={aiPreview.isRoundTrip ? colors.accent : colors.textSecondary} />
                  <Text style={[s.optionPillText, aiPreview.isRoundTrip && { color: colors.accent }]}>Andata e ritorno</Text>
                </Pressable>
                <Pressable
                  style={[s.optionPill, aiPreview.isMultiDay && { backgroundColor: "#7c3aed22", borderColor: "#a78bfa" }]}
                  onPress={() => setAiPreview((p) => p ? { ...p, isMultiDay: !p.isMultiDay } : p)}
                >
                  <Ionicons name="calendar-outline" size={14} color={aiPreview.isMultiDay ? "#a78bfa" : colors.textSecondary} />
                  <Text style={[s.optionPillText, aiPreview.isMultiDay && { color: "#a78bfa" }]}>
                    {aiPreview.isMultiDay ? `${aiPreview.daysEstimate} giorni` : "Multi-giorno"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[s.optionPill, aiPreview.avoidHighways && { backgroundColor: colors.accent + "22", borderColor: colors.accent }]}
                  onPress={() => setAiPreview((p) => p ? { ...p, avoidHighways: !p.avoidHighways } : p)}
                >
                  <MaterialCommunityIcons name="highway" size={14} color={aiPreview.avoidHighways ? colors.accent : colors.textSecondary} />
                  <Text style={[s.optionPillText, aiPreview.avoidHighways && { color: colors.accent }]}>Evita autostrade</Text>
                </Pressable>
              </View>
              {aiPreview.isRoundTrip && (
                <CompassSelector
                  value={aiPreview.roundTripDirection}
                  onChange={(d) => setAiPreview((p) => p ? { ...p, roundTripDirection: d } : p)}
                  colors={colors}
                />
              )}
            </View>

            {aiPreview.items.some((i) => !i.resolved && !i.geocoding && i.editedName) && (
              <View style={s.previewWarning}>
                <Ionicons name="warning-outline" size={14} color="#f59e0b" />
                <Text style={s.previewWarningText}>
                  Alcune tappe non sono state risolte. Modificale manualmente o il percorso potrebbe non calcolarsi.
                </Text>
              </View>
            )}

            <Pressable style={s.primaryBtn} onPress={handleConfirmPreview}>
              <MaterialCommunityIcons name="map-marker-path" size={18} color="#000" />
              <Text style={s.primaryBtnText}>Conferma e modifica percorso</Text>
            </Pressable>

            <Pressable style={s.secondaryBtn} onPress={() => { setMode("ai"); setAiPreview(null); }}>
              <Ionicons name="arrow-back-outline" size={16} color={colors.textSecondary} />
              <Text style={s.secondaryBtnText}>Rigenera con AI</Text>
            </Pressable>
          </View>
        )}

        {/* ── MANUAL mode ───────────────────────────────────────────────────── */}
        {mode === "manual" && (
          <>
            {/* Title */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Titolo</Text>
              <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Nome del giro" placeholderTextColor={colors.textSecondary} />
            </View>

            {/* Curviness slider — 5 levels */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Stile percorso</Text>
              <View style={s.curvinessRow}>
                {STYLE_LEVELS.map((sl, idx) => (
                  <Pressable
                    key={sl.key}
                    style={[s.curvinessBtn, style === sl.key && { backgroundColor: colors.accent }]}
                    onPress={() => setStyle(sl.key)}
                  >
                    <Text style={[s.curvinessBtnText, style === sl.key && { color: "#000" }]} numberOfLines={1}>{sl.shortLabel}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.curvinessDesc}>
                {style === "direct" && "Percorso più breve possibile, predilige grandi arterie"}
                {style === "fast" && "Percorso veloce, rettilineo con poche deviazioni"}
                {style === "balanced" && "Buon mix di curve e rettilineo"}
                {style === "curvy" && "Strade curve e panoramiche — ideale per i bikers"}
                {style === "extra_curvy" && "Massimizza le curve: strade secondarie e tortuose"}
              </Text>
            </View>

            {/* Planner map */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Mappa percorso</Text>
              <View style={s.plannerMapContainer}>
                <WebView
                  ref={webviewRef}
                  source={{ html: plannerMapHtml, baseUrl: "" }}
                  style={s.plannerMap}
                  scrollEnabled={false}
                  javaScriptEnabled
                  originWhitelist={["*"]}
                  onMessage={(e) => {
                    try {
                      const msg = JSON.parse(e.nativeEvent.data);
                      if (msg.type === "tap") handleMapTap(msg.lat, msg.lng);
                    } catch {}
                  }}
                />
                <View style={s.mapHintBadge}>
                  <Ionicons name="location-outline" size={12} color="#fff" />
                  <Text style={s.mapHintText}>Tocca per aggiungere tappe</Text>
                </View>
                {isApproxRoute && (
                  <View style={s.approxBanner}>
                    <Ionicons name="warning-outline" size={13} color="#f97316" />
                    <Text style={s.approxBannerText}>percorso approssimativo</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Waypoints */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Percorso</Text>
              {waypoints.map((wp, i) => (
                <View key={i} style={s.wpRow}>
                  <View style={s.wpDot}>
                    <View style={[s.wpDotInner, {
                      backgroundColor: i === 0 ? "#22c55e" : i === waypoints.length - 1 ? colors.accentRed : colors.accent,
                    }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={[s.input, wp.lat !== 0 && { borderColor: "#22c55e55" }]}
                      value={wpInputs[i] ?? ""}
                      onChangeText={(t) => handleWpInput(t, i)}
                      placeholder={i === 0 ? "Partenza..." : i === waypoints.length - 1 ? "Arrivo..." : `Tappa ${i}...`}
                      placeholderTextColor={colors.textSecondary}
                    />
                    {wpSuggestions?.index === i && wpSuggestions.results.length > 0 && (
                      <View style={s.suggestions}>
                        {wpSuggestions.results.map((geo, gi) => (
                          <Pressable key={gi} style={s.suggestion} onPress={() => selectSuggestion(i, geo)}>
                            <Ionicons name="location-outline" size={14} color={colors.accent} />
                            <Text style={s.suggestionText} numberOfLines={2}>{geo.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                  {waypoints.length > 2 && i > 0 && i < waypoints.length - 1 && (
                    <Pressable onPress={() => removeWaypoint(i)} hitSlop={10} style={{ padding: 4 }}>
                      <Ionicons name="close-circle" size={20} color={colors.accentRed} />
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable style={s.addWpBtn} onPress={addWaypoint}>
                <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                <Text style={s.addWpText}>Aggiungi tappa</Text>
              </Pressable>
            </View>

            {/* Options */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Opzioni percorso</Text>

              <View style={s.toggleRow}>
                <View style={s.toggleInfo}>
                  <Ionicons name="repeat-outline" size={18} color={colors.text} />
                  <Text style={s.toggleLabel}>Andata e ritorno</Text>
                </View>
                <Switch value={isRoundTrip} onValueChange={(v) => { setIsRoundTrip(v); if (!v) setHeadingDeg(null); }}
                  trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
              </View>

              {isRoundTrip && (
                <View style={s.sliderSection}>
                  <View style={s.sliderLabelRow}>
                    <Text style={s.sliderLabel}>Durata massima</Text>
                    <Text style={s.sliderValue}>{roundTripHours}h</Text>
                  </View>
                  <Slider
                    style={{ width: "100%", height: 36 }}
                    minimumValue={1} maximumValue={12} step={1}
                    value={roundTripHours} onValueChange={setRoundTripHours}
                    minimumTrackTintColor={colors.accent}
                    maximumTrackTintColor={colors.border}
                    thumbTintColor={colors.accent}
                  />
                  <View style={s.sliderTicks}>
                    {[1, 3, 6, 9, 12].map((h) => <Text key={h} style={s.sliderTick}>{h}h</Text>)}
                  </View>

                  {/* Compass rose */}
                  <Text style={[s.sliderLabel, { marginTop: 12, marginBottom: 8 }]}>Direzione di partenza preferita</Text>
                  <View style={s.compassGrid}>
                    <Pressable
                      style={[s.compassCenter, headingDeg === null && { backgroundColor: colors.accent }]}
                      onPress={() => setHeadingDeg(null)}
                    >
                      <Text style={[s.compassDirText, headingDeg === null && { color: "#000" }]}>Qualsiasi</Text>
                    </Pressable>
                    <View style={s.compassRing}>
                      {COMPASS_DIRECTIONS.map((dir) => (
                        <Pressable
                          key={dir.label}
                          style={[s.compassDir, headingDeg === dir.deg && { backgroundColor: colors.accent }]}
                          onPress={() => setHeadingDeg(headingDeg === dir.deg ? null : dir.deg)}
                        >
                          <Text style={[s.compassDirText, headingDeg === dir.deg && { color: "#000" }]}>{dir.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              <View style={s.toggleRow}>
                <View style={s.toggleInfo}>
                  <Ionicons name="calendar-outline" size={18} color={colors.text} />
                  <Text style={s.toggleLabel}>Giro multi-giorno</Text>
                </View>
                <Switch value={isMultiDay} onValueChange={setIsMultiDay}
                  trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
              </View>
              {isMultiDay && (
                <View style={s.sliderSection}>
                  <View style={s.sliderLabelRow}>
                    <Text style={s.sliderLabel}>Numero giorni</Text>
                    <Text style={s.sliderValue}>{daysCount} giorni</Text>
                  </View>
                  <Slider
                    style={{ width: "100%", height: 36 }}
                    minimumValue={2} maximumValue={14} step={1}
                    value={daysCount} onValueChange={setDaysCount}
                    minimumTrackTintColor={colors.accent}
                    maximumTrackTintColor={colors.border}
                    thumbTintColor={colors.accent}
                  />
                  <View style={s.sliderLabelRow}>
                    <Text style={s.sliderLabel}>Ore guida/giorno</Text>
                    <Text style={s.sliderValue}>{maxHoursPerDay}h</Text>
                  </View>
                  <Slider
                    style={{ width: "100%", height: 36 }}
                    minimumValue={2} maximumValue={10} step={1}
                    value={maxHoursPerDay} onValueChange={setMaxHoursPerDay}
                    minimumTrackTintColor={colors.accent}
                    maximumTrackTintColor={colors.border}
                    thumbTintColor={colors.accent}
                  />
                </View>
              )}

              <Text style={[s.sectionLabel, { marginTop: 8, marginBottom: 4 }]}>Evita</Text>
              {[
                { key: "avoidHighways" as const, label: "Autostrade", icon: "highway" as const, value: avoidHighways, set: setAvoidHighways },
                { key: "avoidTolls" as const, label: "Pedaggi", icon: "cash" as const, value: avoidTolls, set: setAvoidTolls },
                { key: "avoidFerries" as const, label: "Traghetti", icon: "ferry" as const, value: avoidFerries, set: setAvoidFerries },
                { key: "avoidUnpaved" as const, label: "Strade sterrate", icon: "terrain" as const, value: avoidUnpaved, set: setAvoidUnpaved },
              ].map((opt) => (
                <View key={opt.key} style={s.toggleRow}>
                  <View style={s.toggleInfo}>
                    <MaterialCommunityIcons name={opt.icon} size={18} color={colors.text} />
                    <Text style={s.toggleLabel}>{opt.label}</Text>
                  </View>
                  <Switch value={opt.value} onValueChange={opt.set}
                    trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
                </View>
              ))}

              <View style={s.toggleRow}>
                <View style={s.toggleInfo}>
                  <Ionicons name="globe-outline" size={18} color={colors.text} />
                  <Text style={s.toggleLabel}>Visibile alla community</Text>
                </View>
                <Switch value={visibility === "public"} onValueChange={(v) => setVisibility(v ? "public" : "private")}
                  trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
              </View>
            </View>

            {/* Garage integration */}
            {motorcycles.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>La tua moto (soste benzina)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {motorcycles.map((moto) => (
                    <Pressable
                      key={moto.id}
                      style={[s.motoChip, selectedMotoId === moto.id && { borderColor: colors.accent, borderWidth: 2 }]}
                      onPress={() => setSelectedMotoId(selectedMotoId === moto.id ? null : moto.id)}
                    >
                      <MaterialCommunityIcons name="motorbike" size={16} color={selectedMotoId === moto.id ? colors.accent : colors.textSecondary} />
                      <Text style={[s.motoChipText, selectedMotoId === moto.id && { color: colors.accent }]}>
                        {moto.brand} {moto.model}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {selectedMotoId && (
                  <View style={s.sliderSection}>
                    <View style={s.sliderLabelRow}>
                      <MaterialCommunityIcons name="gas-station" size={16} color={colors.textSecondary} />
                      <Text style={s.sliderLabel}>Livello carburante</Text>
                      <Text style={s.sliderValue}>{fuelLevel}%</Text>
                    </View>
                    <Slider
                      style={{ width: "100%", height: 36 }}
                      minimumValue={10} maximumValue={100} step={5}
                      value={fuelLevel} onValueChange={setFuelLevel}
                      minimumTrackTintColor={fuelLevel < 30 ? colors.accentRed : colors.accent}
                      maximumTrackTintColor={colors.border}
                      thumbTintColor={colors.accent}
                    />
                    <Text style={s.hint}>
                      Autonomia stimata: ~{autonomyKm} km
                      {fuelStopsNeeded > 0 ? ` — ${fuelStopsNeeded} sosta/e benzina previste` : " — nessuna sosta benzina necessaria"}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Calculate */}
            <Pressable
              style={[s.primaryBtn, calculating && { opacity: 0.6 }]}
              onPress={handleCalculate} disabled={calculating}
            >
              {calculating ? <ActivityIndicator color="#000" size="small" /> : <MaterialCommunityIcons name="map-marker-path" size={18} color="#000" />}
              <Text style={s.primaryBtnText}>{calculating ? "Calcolo in corso..." : "Calcola percorso"}</Text>
            </Pressable>

            {/* Route result */}
            {routeResult && (
              <View style={s.resultCard}>
                <Text style={s.resultTitle}>Percorso calcolato</Text>
                <View style={s.resultStats}>
                  {[
                    { icon: "navigate-outline", value: `${routeResult.distanceKm} km`, label: "Distanza" },
                    { icon: "time-outline", value: `${Math.floor(routeResult.durationMinutes / 60)}h ${routeResult.durationMinutes % 60}m`, label: "Durata" },
                    { icon: "steering", value: String(Math.round(routeResult.bikerScore * 100)), label: "BikerScore" },
                  ].map((stat, i) => (
                    <View key={i} style={s.resultStat}>
                      <Ionicons name={stat.icon as any} size={20} color={colors.accent} />
                      <Text style={s.resultStatValue}>{stat.value}</Text>
                      <Text style={s.resultStatLabel}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                <View style={s.bikerScoreSection}>
                  <View style={s.bsLabelRow}>
                    <Text style={s.bsLabel}>BikerScore (curvatura)</Text>
                    <Animated.Text style={[s.bsValue, {
                      color: bikerScoreAnim.interpolate({
                        inputRange: [0, 40, 70, 100],
                        outputRange: [colors.textSecondary, colors.accent, colors.accent, "#22c55e"],
                        extrapolate: "clamp",
                      }),
                    }]}>
                      {Math.round(routeResult.bikerScore * 100)}/100
                    </Animated.Text>
                  </View>
                  <View style={s.bsBarBg}>
                    <Animated.View style={[s.bsBarFill, {
                      width: bikerScoreAnim.interpolate({
                        inputRange: [0, 100],
                        outputRange: ["0%", "100%"],
                        extrapolate: "clamp",
                      }),
                      backgroundColor: bikerScoreAnim.interpolate({
                        inputRange: [0, 40, 70, 100],
                        outputRange: [colors.textSecondary, colors.accent, colors.accent, "#22c55e"],
                        extrapolate: "clamp",
                      }),
                    }]} />
                  </View>
                </View>

                {/* Elevation profile */}
                {routeResult.elevationProfile && routeResult.elevationProfile.length > 2 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={s.bsLabel}>Profilo altimetrico</Text>
                    <View style={{ marginTop: 6 }}>
                      <ElevationProfile
                        profile={routeResult.elevationProfile}
                        gainM={routeResult.elevationGainM}
                        minM={routeResult.altitudeMinM}
                        maxM={routeResult.altitudeMaxM}
                        height={120}
                      />
                    </View>
                  </View>
                )}

                {/* Weather preview banner */}
                {weatherLoading && (
                  <View style={s.weatherBanner}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={s.weatherBannerText}>Caricamento meteo...</Text>
                  </View>
                )}
                {!weatherLoading && weatherPreview && weatherPreview.length > 0 && (
                  <View style={s.weatherBanner}>
                    <Ionicons name={weatherPreview[0].isSuitable ? "partly-sunny-outline" : "rainy-outline"} size={20} color={weatherPreview[0].isSuitable ? colors.accent : colors.accentRed} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.weatherBannerText}>
                        {weatherPreview[0].tempNow !== null ? `${Math.round(weatherPreview[0].tempNow)}°C` : ""}
                        {weatherPreview[0].precipProb > 30 ? ` · 💧 ${weatherPreview[0].precipProb}% pioggia` : ""}
                        {" · "}{weatherPreview[0].weatherDesc}
                      </Text>
                      {!weatherPreview.every((w) => w.isSuitable) && (
                        <Text style={[s.weatherBannerText, { color: colors.accentRed, fontSize: 11 }]}>⚠ Pioggia prevista in alcune tappe</Text>
                      )}
                    </View>
                  </View>
                )}

                {isMultiDay && (
                  <View style={s.multiDayPreview}>
                    <MaterialCommunityIcons name="calendar-range" size={16} color="#a78bfa" />
                    <Text style={s.multiDayPreviewText}>
                      {daysCount} giorni · ~{Math.round(routeResult.distanceKm / daysCount)} km/giorno
                    </Text>
                  </View>
                )}

                {selectedMotoId && fuelStopsNeeded > 0 && (
                  <View style={s.fuelPreview}>
                    <MaterialCommunityIcons name="gas-station" size={16} color={colors.accent} />
                    <Text style={s.fuelPreviewText}>{fuelStopsNeeded} sosta/e carburante stimate</Text>
                  </View>
                )}
              </View>
            )}

            {routeResult && (
              <Pressable
                style={[s.saveBtn, saveMutation.isPending && { opacity: 0.6 }]}
                onPress={handleSave} disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons name="save-outline" size={18} color={colors.accent} />}
                <Text style={s.saveBtnText}>{saveMutation.isPending ? "Salvataggio..." : "Salva giro"}</Text>
              </Pressable>
            )}
          </>
        )}

        {debugVisible && (
          <DebugPanel logs={debugLogs} onClear={clearDebugLogs} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 10 },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  navTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  modeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface },
  modeChipText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.text },
  section: { marginBottom: 20 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  aiInput: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, fontFamily: "Inter_400Regular", fontSize: 15, color: colors.text, minHeight: 100, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, marginBottom: 10 },
  primaryBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#000" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, textAlign: "center" },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  previewHeaderText: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text },
  previewHint: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  pillSection: { marginBottom: 16 },
  pillLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.textSecondary, marginBottom: 6, letterSpacing: 0.5 },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1 },
  pillInput: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text },
  pillRow: { flexDirection: "row", gap: 8 },
  stylePill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  stylePillText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary },
  locationPillRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  locationPillDot: { width: 10, height: 10, borderRadius: 5 },
  locationPill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  locationPillRole: { fontFamily: "Inter_700Bold", fontSize: 11 },
  locationPillInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text },
  optionPillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  optionPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  optionPillText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary },
  previewWarning: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#f59e0b22", borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: "#f59e0b44" },
  previewWarningText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#f59e0b", flex: 1 },
  curvinessRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  curvinessBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  curvinessBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.textSecondary },
  curvinessDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, textAlign: "center" },
  plannerMapContainer: { height: 220, borderRadius: 14, overflow: "hidden", position: "relative", borderWidth: 1, borderColor: colors.border },
  plannerMap: { flex: 1 },
  mapHintBadge: { position: "absolute", bottom: 8, left: "50%", transform: [{ translateX: -70 }], backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5 },
  mapHintText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#fff" },
  input: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  wpRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  wpDot: { width: 20, alignItems: "center", paddingTop: 14 },
  wpDotInner: { width: 10, height: 10, borderRadius: 5 },
  addWpBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  addWpText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.accent },
  suggestions: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginTop: -4, marginBottom: 6 },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, flex: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  toggleInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text },
  sliderSection: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4 },
  sliderLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  sliderLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary },
  sliderValue: { fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text },
  sliderTicks: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 },
  sliderTick: { fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary },
  compassGrid: { gap: 8 },
  compassRing: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  compassDir: { width: 48, height: 36, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  compassCenter: { alignSelf: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  compassDirText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text },
  motoChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  motoChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary },
  resultCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginTop: 16, marginBottom: 8, gap: 12 },
  resultTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text },
  resultStats: { flexDirection: "row", justifyContent: "space-around" },
  resultStat: { alignItems: "center", gap: 4 },
  resultStatValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text },
  resultStatLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  bikerScoreSection: { gap: 6 },
  bsLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  bsLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary },
  bsValue: { fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text },
  bsBarBg: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  bsBarFill: { height: "100%" as any, borderRadius: 4 },
  bsDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  weatherBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.background, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  weatherBannerText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.text },
  multiDayPreview: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#7c3aed18", borderRadius: 10, padding: 10 },
  multiDayPreviewText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#a78bfa", flex: 1 },
  fuelPreview: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.accent + "18", borderRadius: 10, padding: 10 },
  fuelPreviewText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.accent, flex: 1 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5, borderColor: colors.accent, marginTop: 4 },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.accent },
  approxBanner: { position: "absolute", top: 10, left: "50%" as any, transform: [{ translateX: -90 }], flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#f9731650" },
  approxBannerText: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#f97316" },
});
