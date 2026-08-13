/* eslint-disable @typescript-eslint/no-explicit-any */
import { Waypoint, Style, WeatherWaypoint, ResolvedPoiStop, PoiResult, AiPreviewItem, AiPreviewState, RouteResult, GeoResult, Style as StyleType } from "./types";
import { parseAI, clientFallbackAiParse, AiKeyMissingError } from "./api";
import { getApiUrl } from "@/lib/query-client";
import { COMPASS_DIRECTIONS } from "./types";
import { Alert } from "react-native";

export const handleAiParseHelper = async (
  aiPrompt: string,
  setAiLoading: (v: boolean) => void,
  setResolvedPoiStops: (v: ResolvedPoiStop[]) => void,
  setAiProviderUsed: (v: string | null) => void,
  setAiPreview: (v: AiPreviewState | ((prev: AiPreviewState | null) => AiPreviewState | null)) => void,
  setMode: (v: any) => void,
  setAiSuccessBanner: (v: boolean) => void,
  aiSuccessTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  logFetch: any,
  setTitle: (v: string) => void,
  setStyle: (v: StyleType) => void,
  setIsRoundTrip: (v: boolean) => void,
  setIsMultiDay: (v: boolean) => void,
  setDaysCount: (v: number) => void,
  setAvoidHighways: (v: boolean) => void,
  setAiBannerReason: (v: "key_missing" | "generic") => void,
  setAiFallbackBanner: (v: boolean) => void
) => {
  if (!aiPrompt.trim()) return;
  setAiLoading(true);
  try {
    const result = await parseAI(aiPrompt);

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
      lat: 0, lng: 0, geocoding: !!loc.name, resolved: false, suggestions: []
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
      logFetch(
        "/api/planned-routes/geocode", "GET",
        () => { const url = new URL("/api/planned-routes/geocode", getApiUrl()); url.searchParams.set("q", item.name); return fetch(url.toString(), { credentials: "include" }); },
        async (resp: Response) => { if (!resp.ok) return []; return resp.json(); }
      ).then((results: any[]) => {
        const candidates = (Array.isArray(results) ? results : [])
          .map((item: any) => ({
            name: String(item.name ?? ""),
            lat: Number(item.lat),
            lng: Number(item.lng ?? item.lon),
          }))
          .filter((item: GeoResult) => item.name && Number.isFinite(item.lat) && Number.isFinite(item.lng));
        const best = candidates.length === 1 ? candidates[0] : null;
        setAiPreview((prev) => {
          if (!prev) return prev;
          const updatedItems = [...prev.items];
          updatedItems[idx] = { ...updatedItems[idx], lat: best?.lat ?? 0, lng: best?.lng ?? 0, suggestions: candidates, geocoding: false, resolved: !!best };
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

export const regeocodePillItemHelper = (
  idx: number,
  name: string,
  setAiPreview: (v: AiPreviewState | ((prev: AiPreviewState | null) => AiPreviewState | null)) => void,
  logFetch: any
) => {
  if (!name.trim()) return;
  setAiPreview((prev) => {
    if (!prev) return prev;
    const items = [...prev.items];
    items[idx] = { ...items[idx], geocoding: true };
    return { ...prev, items };
  });
  logFetch(
    "/api/planned-routes/geocode", "GET",
    () => { const url = new URL("/api/planned-routes/geocode", getApiUrl()); url.searchParams.set("q", name); return fetch(url.toString(), { credentials: "include" }); },
    async (resp: Response) => { if (!resp.ok) return []; return resp.json(); }
  ).then((results: any[]) => {
    const candidates = (Array.isArray(results) ? results : [])
      .map((item: any) => ({
        name: String(item.name ?? ""),
        lat: Number(item.lat),
        lng: Number(item.lng ?? item.lon),
      }))
      .filter((item: GeoResult) => item.name && Number.isFinite(item.lat) && Number.isFinite(item.lng));
    const best = candidates.length === 1 ? candidates[0] : null;
    setAiPreview((prev) => {
      if (!prev) return prev;
      const updatedItems = [...prev.items];
      updatedItems[idx] = { ...updatedItems[idx], lat: best?.lat ?? 0, lng: best?.lng ?? 0, suggestions: candidates, geocoding: false, resolved: !!best };
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
};

export const selectPreviewItemSuggestionHelper = (
  idx: number,
  candidate: GeoResult,
  setAiPreview: (v: AiPreviewState | ((prev: AiPreviewState | null) => AiPreviewState | null)) => void
) => {
  setAiPreview((prev) => {
    if (!prev) return prev;
    const items = [...prev.items];
    items[idx] = {
      ...items[idx],
      editedName: candidate.name,
      lat: candidate.lat,
      lng: candidate.lng,
      resolved: true,
      geocoding: false,
    };
    return { ...prev, items };
  });
};

export const handleConfirmPreviewHelper = async (
  aiPreview: AiPreviewState | null,
  resolvedPoiStops: ResolvedPoiStop[],
  setTitle: (v: string) => void,
  setStyle: (v: StyleType) => void,
  setIsRoundTrip: (v: boolean) => void,
  setHeadingDeg: (v: number | null) => void,
  setIsMultiDay: (v: boolean) => void,
  setDaysCount: (v: number) => void,
  setAvoidHighways: (v: boolean) => void,
  setWaypoints: (v: Waypoint[]) => void,
  setWpInputs: (v: string[]) => void,
  setMode: (v: any) => void,
  setCalculating: (v: boolean) => void,
  setRouteResult: (v: RouteResult | null) => void,
  setWeatherPreview: (v: WeatherWaypoint[] | null) => void,
  setDismissedWarnings: (v: Set<string>) => void,
  logFetch: any,
  drivingProfile: string,
  language: string | undefined,
  vehicleProfile: string,
  maxHoursPerDay: number,
  autoLoadWeather: (wps: Waypoint[]) => void
) => {
  if (!aiPreview) return;
  const unresolved = aiPreview.items.filter(
    (item) => item.geocoding || !item.resolved || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)
  );
  if (unresolved.length > 0) {
    Alert.alert("Luoghi da confermare", "Seleziona un indirizzo per ogni punto prima di calcolare il percorso.");
    return;
  }
  const geoWps: Waypoint[] = aiPreview.items.map((item) => ({
    lat: item.lat, lng: item.lng, name: item.editedName || item.name
  }));
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
  const allItemsResolved = aiPreview.items.every((item) => item.resolved);
  setCalculating(true);
  setRouteResult(null);
  setWeatherPreview(null);
  try {
    const result = await logFetch(
      "/api/planned-routes/calculate", "POST",
      () => {
        const url = new URL("/api/planned-routes/calculate", getApiUrl());
        const ghRoutingProfile = vehicleProfile === "auto_curvy" ? "auto_curvy" : vehicleProfile === "moto_fast" ? "motorcycle_fast" : vehicleProfile === "car" ? "car" : undefined;
        return fetch(url.toString(), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waypoints: toCalc, style: aiPreview.style, drivingProfile, avoidHighways: aiPreview.avoidHighways, avoidTolls: false, isRoundTrip: aiPreview.isRoundTrip, roundTripDirection: aiPreview.roundTripDirection ?? null, language, geocodingOk: allItemsResolved, ...(ghRoutingProfile ? { routingProfile: ghRoutingProfile } : {}) }) });
      },
      async (resp: Response) => { if (!resp.ok) { const b = await resp.json().catch(() => ({})); throw new Error(b.message ?? "Calcolo fallito"); } return resp.json(); }
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
