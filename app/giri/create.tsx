import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Switch,
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

type Style = "curvy" | "balanced" | "fast";
type Mode = "ai" | "ai-preview" | "manual";
type CompassDir = "N" | "NE" | "E" | "SE" | "S" | "SO" | "O" | "NO";

interface Waypoint { lat: number; lng: number; name: string; }
interface GeoResult { name: string; lat: number; lng: number; }
interface RouteResult {
  encoded?: string | null;
  rawPoints?: [number, number][] | null;
  distanceKm: number;
  durationMinutes: number;
  bikerScore: number;
  approximate?: boolean;
  navigationSteps?: Array<{ sign: number; text: string; distance: number; interval: [number, number]; streetName?: string }> | null;
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
  isMultiDay: boolean;
  daysEstimate: number;
  avoidHighways: boolean;
  items: AiPreviewItem[];
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, b: number;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

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
  roundTripHours?: number,
  isRoundTrip?: boolean,
  roundTripDirection?: CompassDir | null,
): Promise<RouteResult> {
  const url = new URL("/api/planned-routes/calculate", getApiUrl());
  const resp = await fetch(url.toString(), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ waypoints, style, avoidHighways, avoidTolls, roundTripHours, isRoundTrip, roundTripDirection }),
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

const COMPASS_LAYOUT: (CompassDir | null)[][] = [
  ["NO", "N", "NE"],
  ["O",  null, "E"],
  ["SO", "S", "SE"],
];

const COMPASS_LABEL: Record<CompassDir, string> = {
  N: "N", NE: "NE", E: "E", SE: "SE", S: "S", SO: "SO", O: "O", NO: "NO",
};

function CompassSelector({
  value,
  onChange,
  colors,
}: {
  value: CompassDir | null;
  onChange: (d: CompassDir | null) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ marginTop: 14, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary }}>
          Direzione preferita
        </Text>
        {value && (
          <Pressable onPress={() => onChange(null)}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.accent }}>Rimuovi</Text>
          </Pressable>
        )}
      </View>
      <View style={{ alignSelf: "center", gap: 4 }}>
        {COMPASS_LAYOUT.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row", gap: 4 }}>
            {row.map((dir, ci) =>
              dir === null ? (
                <View key={ci} style={{ width: 52, height: 52, justifyContent: "center", alignItems: "center" }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: value ? colors.accent : colors.border }} />
                </View>
              ) : (
                <Pressable
                  key={dir}
                  onPress={() => onChange(value === dir ? null : dir)}
                  style={{
                    width: 52, height: 52, borderRadius: 10, justifyContent: "center", alignItems: "center",
                    backgroundColor: value === dir ? colors.accent + "22" : colors.surface,
                    borderWidth: 1.5,
                    borderColor: value === dir ? colors.accent : colors.border,
                  }}
                >
                  <Text style={{
                    fontFamily: "Inter_700Bold", fontSize: 14,
                    color: value === dir ? colors.accent : colors.text,
                  }}>
                    {COMPASS_LABEL[dir]}
                  </Text>
                </Pressable>
              )
            )}
          </View>
        ))}
      </View>
      {value && (
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, textAlign: "center", marginTop: 4 }}>
          Il percorso partirà verso {value}
        </Text>
      )}
    </View>
  );
}

export default function GiriCreateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

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

  // AI Preview state
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);

  // Manual mode route params
  const [title, setTitle] = useState("Giro in moto");
  const [style, setStyle] = useState<Style>("curvy");
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [roundTripHours, setRoundTripHours] = useState(3);
  const [roundTripDirection, setRoundTripDirection] = useState<CompassDir | null>(null);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [daysCount, setDaysCount] = useState(2);
  const [maxHoursPerDay, setMaxHoursPerDay] = useState(6);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [selectedMotoId, setSelectedMotoId] = useState<string | null>(null);
  const [fuelLevel, setFuelLevel] = useState<number>(100);

  const [waypoints, setWaypoints] = useState<Waypoint[]>([{ lat: 0, lng: 0, name: "" }, { lat: 0, lng: 0, name: "" }]);
  const [wpInputs, setWpInputs] = useState<string[]>(["", ""]);
  const [wpSuggestions, setWpSuggestions] = useState<{ index: number; results: GeoResult[] } | null>(null);

  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  const suggestionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCalcTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webviewRef = useRef<WebView | null>(null);

  const TILE = getTileConfig("carto_dark");

  const isApproxRoute = !!routeResult && (!!routeResult.approximate || !routeResult.encoded);

  const plannerMapHtml = useMemo(() => {
    let resolvedPts: Array<{ lat: number; lng: number }> | undefined;
    if (routeResult?.encoded) {
      resolvedPts = decodePolyline(routeResult.encoded);
    } else if (routeResult?.rawPoints) {
      resolvedPts = routeResult.rawPoints.map(([lat, lng]) => ({ lat, lng }));
    }
    return buildPlannerMapHtml(
      TILE.urlTemplate,
      TILE.maximumZ,
      colors.accent,
      waypoints,
      resolvedPts
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, colors.accent, routeResult?.encoded, routeResult?.rawPoints]);

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

  // ── AI Parse + auto-geocoding ──────────────────────────────────────────────

  const handleAiParse = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const result = await logFetch<any>(
        "/api/planned-routes/ai-parse", "POST",
        () => {
          const url = new URL("/api/planned-routes/ai-parse", getApiUrl());
          return fetch(url.toString(), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: aiPrompt }) });
        },
        async (resp) => { if (!resp.ok) throw new Error("AI non disponibile"); return resp.json(); }
      );

      // Build initial preview items (unresolved)
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
        role: loc.role,
        name: loc.name,
        editedName: loc.name,
        lat: 0, lng: 0,
        geocoding: !!loc.name,
        resolved: false,
      }));

      const preview: AiPreviewState = {
        title: result.title ?? "Giro in moto",
        style: result.style ?? "curvy",
        isRoundTrip: result.isRoundTrip ?? false,
        isMultiDay: result.isMultiDay ?? false,
        daysEstimate: result.daysEstimate ?? 2,
        avoidHighways: result.avoidHighways ?? false,
        items: initialItems,
      };

      setAiPreview(preview);
      setMode("ai-preview");

      // Auto-geocode each location in parallel
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
            updatedItems[idx] = {
              ...updatedItems[idx],
              lat: best ? best.lat : 0,
              lng: best ? best.lng : 0,
              geocoding: false,
              resolved: !!best,
            };
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
      const msg = err?.message ?? "Servizio AI non disponibile";
      Alert.alert("Errore AI", msg);
      setMode("manual");
    } finally {
      setAiLoading(false);
    }
  };

  // Update a preview item name (for inline editing of pills)
  const updatePreviewItemName = useCallback((idx: number, newName: string) => {
    setAiPreview((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], editedName: newName, lat: 0, lng: 0, resolved: false };
      return { ...prev, items };
    });
  }, []);

  // Re-geocode a pill after user edits it
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

  // Confirm AI preview: transfer state, auto-calculate, then switch to manual
  const handleConfirmPreview = async () => {
    if (!aiPreview) return;

    const newWps: Waypoint[] = aiPreview.items.map((item) => ({
      lat: item.lat,
      lng: item.lng,
      name: item.editedName || item.name,
    }));
    const newInputs = newWps.map((wp) => wp.name);

    setTitle(aiPreview.title);
    setStyle(aiPreview.style);
    setIsRoundTrip(aiPreview.isRoundTrip);
    setIsMultiDay(aiPreview.isMultiDay);
    setDaysCount(aiPreview.daysEstimate);
    setAvoidHighways(aiPreview.avoidHighways);
    setWaypoints(newWps);
    setWpInputs(newInputs);
    setMode("manual");

    // Auto-calculate route immediately using the resolved preview waypoints
    const resolved = newWps.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) {
      // Not enough resolved — just show manual form with a hint
      return;
    }
    const toCalc = aiPreview.isRoundTrip ? [...resolved, resolved[0]] : resolved;
    setCalculating(true);
    setRouteResult(null);
    try {
      const result = await logFetch<RouteResult>(
        "/api/planned-routes/calculate", "POST",
        () => {
          const url = new URL("/api/planned-routes/calculate", getApiUrl());
          return fetch(url.toString(), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waypoints: toCalc, style: aiPreview.style, avoidHighways: aiPreview.avoidHighways, avoidTolls: false }) });
        },
        async (resp) => { if (!resp.ok) throw new Error("Calcolo fallito"); return resp.json(); }
      );
      setRouteResult(result);
      if (result.durationMinutes > 480 && !aiPreview.isMultiDay) {
        const suggestedDays = Math.max(2, Math.min(14, Math.ceil(result.durationMinutes / (maxHoursPerDay * 60))));
        setIsMultiDay(true);
        setDaysCount(suggestedDays);
        Alert.alert(
          "Giro Multi-giorno",
          `Il percorso dura più di 8 ore.\nAbbiamo attivato il piano multi-giorno su ${suggestedDays} giorni.`,
          [{ text: "OK" }]
        );
      }
    } catch (err: any) {
      const msg = err?.message ?? "Calcolo percorso fallito";
      Alert.alert("Calcolo automatico fallito", `${msg}\nModifica le tappe e premi "Calcola percorso" manualmente.`);
    } finally {
      setCalculating(false);
    }
  };

  // ── Manual mode handlers ───────────────────────────────────────────────────

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
        const result = await calcRoute(toCalc, style, avoidHighways, avoidTolls, roundTripHours, isRoundTrip, roundTripDirection);
        setRouteResult(result);
      } catch {
        // silent — user can still trigger manually
      } finally {
        setCalculating(false);
      }
    }, 1500);
    return () => { if (autoCalcTimeout.current) clearTimeout(autoCalcTimeout.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, style, avoidHighways, avoidTolls, isRoundTrip, roundTripHours, roundTripDirection, mode]);

  const handleCalculate = async () => {
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) {
      Alert.alert("Waypoint non risolti", "Seleziona almeno 2 luoghi dalla lista suggerimenti."); return;
    }
    const toCalc = isRoundTrip ? [...resolved, resolved[0]] : resolved;
    setCalculating(true);
    try {
      const result = await logFetch<RouteResult>(
        "/api/planned-routes/calculate", "POST",
        () => {
          const url = new URL("/api/planned-routes/calculate", getApiUrl());
          return fetch(url.toString(), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waypoints: toCalc, style, avoidHighways, avoidTolls, roundTripHours, isRoundTrip, roundTripDirection }) });
        },
        async (resp) => { if (!resp.ok) throw new Error("Calcolo fallito"); return resp.json(); }
      );
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
    } catch (err: any) {
      const msg = err?.message ?? "Calcolo percorso fallito";
      Alert.alert("Errore", msg);
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
      polyline: routeResult?.encoded ?? null,
      distanceKm: routeResult?.distanceKm ?? 0,
      durationMinutes: routeResult?.durationMinutes ?? 0,
      bikerScore: routeResult?.bikerScore ?? 0,
      navigationSteps: routeResult?.navigationSteps ?? null,
      style, visibility, isMultiDay,
      metadata: {
        avoidHighways, avoidTolls, daysCount, maxHoursPerDay,
        isRoundTrip, roundTripHours, roundTripDirection, motorcycleId: selectedMotoId,
        fuelStopsNeeded,
      },
    });
  };

  const styleOptions: { key: Style; label: string; icon: string; desc: string }[] = [
    { key: "curvy", label: "Curve", icon: "road-variant", desc: "Strade curve e panoramiche" },
    { key: "balanced", label: "Bilanciato", icon: "scale-balance", desc: "Mix curve e rettilineo" },
    { key: "fast", label: "Veloce", icon: "rocket-launch-outline", desc: "Percorso più diretto" },
  ];

  const pillRoleLabel = (role: AiPreviewItem["role"]) => {
    if (role === "start") return "Partenza";
    if (role === "end") return "Arrivo";
    return "Tappa";
  };
  const pillRoleColor = (role: AiPreviewItem["role"], colors: any) => {
    if (role === "start") return "#22c55e";
    if (role === "end") return colors.accentRed;
    return colors.accent;
  };

  const s = styles(colors);

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
            {/* Header */}
            <View style={s.previewHeader}>
              <Ionicons name="sparkles" size={18} color={colors.accent} />
              <Text style={s.previewHeaderText}>Anteprima giro generata dall'AI</Text>
            </View>
            <Text style={s.previewHint}>Tocca un pill per modificarlo, poi conferma per calcolare il percorso</Text>

            {/* Title pill */}
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

            {/* Style pills */}
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

            {/* Waypoint pills */}
            <View style={s.pillSection}>
              <Text style={s.pillLabel}>TAPPE</Text>
              {aiPreview.items.map((item, idx) => (
                <View key={idx} style={s.locationPillRow}>
                  <View style={[s.locationPillDot, { backgroundColor: pillRoleColor(item.role, colors) }]} />
                  <View style={[
                    s.locationPill,
                    item.resolved && { borderColor: "#22c55e55" },
                    !item.resolved && !item.geocoding && item.editedName && { borderColor: colors.accentRed + "55" },
                  ]}>
                    <Text style={[s.locationPillRole, { color: pillRoleColor(item.role, colors) }]}>
                      {pillRoleLabel(item.role)}
                    </Text>
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

            {/* Options pills */}
            <View style={s.pillSection}>
              <Text style={s.pillLabel}>OPZIONI</Text>
              <View style={s.optionPillRow}>
                <Pressable
                  style={[s.optionPill, aiPreview.isRoundTrip && { backgroundColor: colors.accent + "22", borderColor: colors.accent }]}
                  onPress={() => setAiPreview((p) => p ? { ...p, isRoundTrip: !p.isRoundTrip } : p)}
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
            </View>

            {/* Geocoding status summary */}
            {aiPreview.items.some((i) => !i.resolved && !i.geocoding && i.editedName) && (
              <View style={s.previewWarning}>
                <Ionicons name="warning-outline" size={14} color="#f59e0b" />
                <Text style={s.previewWarningText}>
                  Alcune tappe non sono state risolte. Modificale manualmente o il percorso potrebbe non calcolarsi.
                </Text>
              </View>
            )}

            {/* CTA buttons */}
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

            {/* Style */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Stile percorso</Text>
              <View style={s.styleRow}>
                {styleOptions.map((opt) => (
                  <Pressable key={opt.key} style={[s.styleCard, style === opt.key && { borderColor: colors.accent, borderWidth: 2 }]} onPress={() => setStyle(opt.key)}>
                    <MaterialCommunityIcons name={opt.icon as any} size={22} color={style === opt.key ? colors.accent : colors.textSecondary} />
                    <Text style={[s.styleLabel, style === opt.key && { color: colors.accent }]}>{opt.label}</Text>
                    <Text style={s.styleDesc}>{opt.desc}</Text>
                  </Pressable>
                ))}
              </View>
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
                <Switch value={isRoundTrip} onValueChange={setIsRoundTrip}
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
                  <CompassSelector value={roundTripDirection} onChange={setRoundTripDirection} colors={colors} />
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

              <View style={s.toggleRow}>
                <View style={s.toggleInfo}>
                  <MaterialCommunityIcons name="highway" size={18} color={colors.text} />
                  <Text style={s.toggleLabel}>Evita autostrade</Text>
                </View>
                <Switch value={avoidHighways} onValueChange={setAvoidHighways}
                  trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
              </View>
              <View style={s.toggleRow}>
                <View style={s.toggleInfo}>
                  <MaterialCommunityIcons name="cash" size={18} color={colors.text} />
                  <Text style={s.toggleLabel}>Evita pedaggi</Text>
                </View>
                <Switch value={avoidTolls} onValueChange={setAvoidTolls}
                  trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
              </View>
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
                    <Text style={s.bsValue}>{Math.round(routeResult.bikerScore * 100)}/100</Text>
                  </View>
                  <View style={s.bsBarBg}>
                    <View style={[s.bsBarFill, {
                      width: `${Math.round(routeResult.bikerScore * 100)}%`,
                      backgroundColor: routeResult.bikerScore >= 0.7 ? "#22c55e" : routeResult.bikerScore >= 0.4 ? colors.accent : colors.textSecondary,
                    }]} />
                  </View>
                  <Text style={s.bsDesc}>
                    {routeResult.bikerScore >= 0.7 ? "Percorso molto curvy — ideale per i bikers!"
                      : routeResult.bikerScore >= 0.4 ? "Buon mix di curve e rettilineo"
                      : "Percorso prevalentemente rettilineo"}
                  </Text>
                </View>

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
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  navTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: colors.text },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  modeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface },
  modeChipText: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text },
  section: { marginBottom: 20 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  aiInput: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, color: colors.text, fontFamily: "Inter_400Regular", fontSize: 14, minHeight: 100, borderWidth: 1, borderColor: colors.border },
  input: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontFamily: "Inter_400Regular", fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 6, lineHeight: 18 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, marginTop: 10, marginBottom: 6 },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#000" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  secondaryBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary },

  // AI Preview styles
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  previewHeaderText: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text },
  previewHint: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 },
  pillSection: { marginBottom: 16 },
  pillLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  pillInput: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text },
  pillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  stylePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stylePillText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary },
  locationPillRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  locationPillDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  locationPill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  locationPillRole: { fontFamily: "Inter_600SemiBold", fontSize: 11, flexShrink: 0 },
  locationPillInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text },
  optionPillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  optionPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  optionPillText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary },
  previewWarning: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#f59e0b22", borderRadius: 10, padding: 12, marginBottom: 10 },
  previewWarningText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#f59e0b", flex: 1, lineHeight: 18 },

  // Manual mode styles
  styleRow: { flexDirection: "row", gap: 8 },
  styleCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12, alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border },
  styleLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text, textAlign: "center" },
  styleDesc: { fontFamily: "Inter_400Regular", fontSize: 10, color: colors.textSecondary, textAlign: "center" },
  wpRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  wpDot: { width: 20, alignItems: "center", paddingTop: 14 },
  wpDotInner: { width: 10, height: 10, borderRadius: 5 },
  suggestions: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, flex: 1 },
  addWpBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingLeft: 28 },
  addWpText: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.accent },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  toggleInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text },
  sliderSection: { paddingVertical: 12, paddingHorizontal: 4, gap: 4 },
  sliderLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sliderLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary, flex: 1 },
  sliderValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: colors.accent },
  sliderTicks: { flexDirection: "row", justifyContent: "space-between" },
  sliderTick: { fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary },
  motoChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  motoChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.text },
  resultCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginTop: 8, gap: 14, borderWidth: 1, borderColor: colors.accent + "44" },
  resultTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text },
  resultStats: { flexDirection: "row", justifyContent: "space-around" },
  resultStat: { alignItems: "center", gap: 4 },
  resultStatValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text },
  resultStatLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  bikerScoreSection: { gap: 6 },
  bsLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  bsLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.textSecondary },
  bsValue: { fontFamily: "Inter_700Bold", fontSize: 13, color: colors.accent },
  bsBarBg: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  bsBarFill: { height: "100%", borderRadius: 4 },
  bsDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  multiDayPreview: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#7c3aed22", borderRadius: 8, padding: 10 },
  multiDayPreviewText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#a78bfa" },
  fuelPreview: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.accent + "22", borderRadius: 8, padding: 10 },
  fuelPreviewText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.accent },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 14, marginTop: 8, borderWidth: 2, borderColor: colors.accent },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.accent },
  plannerMapContainer: { height: 220, borderRadius: 14, overflow: "hidden", position: "relative", borderWidth: 1, borderColor: colors.border },
  plannerMap: { flex: 1 },
  mapHintBadge: { position: "absolute", bottom: 10, left: "50%" as any, transform: [{ translateX: -80 }], flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  mapHintText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#ccc" },
  approxBanner: { position: "absolute", top: 10, left: "50%" as any, transform: [{ translateX: -90 }], flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#f9731650" },
  approxBannerText: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#f97316" },
});
