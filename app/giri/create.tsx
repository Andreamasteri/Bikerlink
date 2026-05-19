import React, { useState, useRef, useMemo } from "react";
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

type Style = "curvy" | "balanced" | "fast";
type Mode = "ai" | "manual";

interface Waypoint { lat: number; lng: number; name: string; }
interface GeoResult { name: string; lat: number; lng: number; }
interface RouteResult {
  encoded?: string | null;
  rawPoints?: [number, number][] | null;
  distanceKm: number;
  durationMinutes: number;
  bikerScore: number;
}

interface UserMotorcycle { id: string; brand: string; model: string; year?: number | null; ridingStyle?: string | null; }

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
): Promise<RouteResult> {
  const url = new URL("/api/planned-routes/calculate", getApiUrl());
  const resp = await fetch(url.toString(), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ waypoints, style, avoidHighways, avoidTolls, roundTripHours, isRoundTrip }),
  });
  if (!resp.ok) throw new Error("Calcolo fallito");
  return resp.json();
}

async function parseAI(prompt: string): Promise<any> {
  const url = new URL("/api/planned-routes/ai-parse", getApiUrl());
  const resp = await fetch(url.toString(), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!resp.ok) throw new Error("AI non disponibile");
  return resp.json();
}

export default function GiriCreateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Mode
  const [mode, setMode] = useState<Mode>("ai");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Route params
  const [title, setTitle] = useState("Giro in moto");
  const [style, setStyle] = useState<Style>("curvy");
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [roundTripHours, setRoundTripHours] = useState(3);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [daysCount, setDaysCount] = useState(2);
  const [maxHoursPerDay, setMaxHoursPerDay] = useState(6);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [selectedMotoId, setSelectedMotoId] = useState<string | null>(null);
  const [fuelLevel, setFuelLevel] = useState<number>(100);

  // Waypoints
  const [waypoints, setWaypoints] = useState<Waypoint[]>([{ lat: 0, lng: 0, name: "" }, { lat: 0, lng: 0, name: "" }]);
  const [wpInputs, setWpInputs] = useState<string[]>(["", ""]);
  const [wpSuggestions, setWpSuggestions] = useState<{ index: number; results: GeoResult[] } | null>(null);

  // Result
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  const suggestionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webviewRef = useRef<WebView | null>(null);

  // Tile config for the planner map
  const TILE = getTileConfig("carto_dark");

  // Build the planner map HTML whenever resolved waypoints or route result change
  const plannerMapHtml = useMemo(() => {
    const resolvedPts = routeResult?.rawPoints
      ? routeResult.rawPoints.map(([lat, lng]) => ({ lat, lng }))
      : null;
    return buildPlannerMapHtml(
      TILE.urlTemplate,
      TILE.maximumZ,
      colors.accent,
      waypoints,
      resolvedPts ?? undefined
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, colors.accent, routeResult?.encoded]);

  // Reverse geocode a tapped lat/lng and add as waypoint
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
      // Fill first unresolved waypoint slot, or insert before last
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
    } catch {
      // Silently ignore reverse geocode failure
    }
  };

  // Load user's motorcycles
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
      setTitle(result.title ?? "Giro in moto");
      setStyle(result.style ?? "curvy");
      setIsRoundTrip(result.isRoundTrip ?? false);
      setIsMultiDay(result.isMultiDay ?? false);
      setDaysCount(result.daysEstimate ?? 2);
      setMaxHoursPerDay(result.maxHoursPerDay ?? 6);
      setAvoidHighways(result.avoidHighways ?? false);

      const newWps: Waypoint[] = [];
      const newInputs: string[] = [];
      if (result.startLocation) {
        newWps.push({ lat: 0, lng: 0, name: result.startLocation });
        newInputs.push(result.startLocation);
      }
      for (const wp of (result.waypoints ?? [])) {
        newWps.push({ lat: 0, lng: 0, name: wp });
        newInputs.push(wp);
      }
      if (result.endLocation && result.endLocation !== result.startLocation) {
        newWps.push({ lat: 0, lng: 0, name: result.endLocation });
        newInputs.push(result.endLocation);
      } else if (newWps.length > 0) {
        newWps.push({ ...newWps[0] });
        newInputs.push(newWps[0].name);
      } else {
        newWps.push({ lat: 0, lng: 0, name: "" });
        newInputs.push("");
      }
      if (newWps.length < 2) { newWps.push({ lat: 0, lng: 0, name: "" }); newInputs.push(""); }
      setWaypoints(newWps);
      setWpInputs(newInputs);
      setMode("manual");
      setRouteResult(null);
    } catch {
      Alert.alert("Errore", "AI non disponibile. Inserisci manualmente.");
      setMode("manual");
    } finally {
      setAiLoading(false);
    }
  };

  const handleWpInput = (text: string, index: number) => {
    const newInputs = [...wpInputs]; newInputs[index] = text; setWpInputs(newInputs);
    const newWps = [...waypoints]; newWps[index] = { ...newWps[index], name: text, lat: 0, lng: 0 }; setWaypoints(newWps);
    if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    if (text.length >= 3) {
      suggestionTimeout.current = setTimeout(async () => {
        const results = await geocode(text);
        setWpSuggestions({ index, results });
      }, 600);
    } else { setWpSuggestions(null); }
  };

  const selectSuggestion = (index: number, geo: GeoResult) => {
    const newWps = [...waypoints]; newWps[index] = { lat: geo.lat, lng: geo.lng, name: geo.name.split(",")[0] }; setWaypoints(newWps);
    const newInputs = [...wpInputs]; newInputs[index] = geo.name.split(",")[0]; setWpInputs(newInputs);
    setWpSuggestions(null);
  };

  const addWaypoint = () => {
    const insertAt = waypoints.length - 1;
    const newWps = [...waypoints]; newWps.splice(insertAt, 0, { lat: 0, lng: 0, name: "" }); setWaypoints(newWps);
    const newInputs = [...wpInputs]; newInputs.splice(insertAt, 0, ""); setWpInputs(newInputs);
  };

  const removeWaypoint = (index: number) => {
    if (waypoints.length <= 2) return;
    setWaypoints(waypoints.filter((_, i) => i !== index));
    setWpInputs(wpInputs.filter((_, i) => i !== index));
  };

  const handleCalculate = async () => {
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) {
      Alert.alert("Waypoint non risolti", "Seleziona almeno 2 luoghi dalla lista suggerimenti."); return;
    }
    const toCalc = isRoundTrip ? [...resolved, resolved[0]] : resolved;
    setCalculating(true);
    try {
      const result = await calcRoute(toCalc, style, avoidHighways, avoidTolls, roundTripHours, isRoundTrip);
      setRouteResult(result);
      // Auto-trigger multi-day if route exceeds 8h and multi-day is not already on
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
    } catch {
      Alert.alert("Errore", "Calcolo percorso fallito.");
    } finally { setCalculating(false); }
  };

  // Fuel stop calculation
  const selectedMoto = motorcycles.find((m) => m.id === selectedMotoId);
  const avgKmPerLiter = 18; // typical motorcycle average
  const tankEstimateL = 15; // typical motorcycle tank
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
      style, visibility, isMultiDay,
      metadata: {
        avoidHighways, avoidTolls, daysCount, maxHoursPerDay,
        isRoundTrip, roundTripHours, motorcycleId: selectedMotoId,
        fuelStopsNeeded,
      },
    });
  };

  const styleOptions: { key: Style; label: string; icon: string; desc: string }[] = [
    { key: "curvy", label: "Curve", icon: "road-variant", desc: "Strade curve e panoramiche" },
    { key: "balanced", label: "Bilanciato", icon: "scale-balance", desc: "Mix curve e rettilineo" },
    { key: "fast", label: "Veloce", icon: "rocket-launch-outline", desc: "Percorso più diretto" },
  ];

  const s = styles(colors);

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <View style={s.nav}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.navTitle}>Pianifica Giro</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Mode selector */}
        <View style={s.modeRow}>
          {(["ai", "manual"] as Mode[]).map((m) => (
            <Pressable key={m} style={[s.modeChip, mode === m && { backgroundColor: colors.accent }]} onPress={() => setMode(m)}>
              <Ionicons name={m === "ai" ? "sparkles" : "create-outline"} size={14} color={mode === m ? "#000" : colors.text} />
              <Text style={[s.modeChipText, mode === m && { color: "#000" }]}>{m === "ai" ? "AI" : "Manuale"}</Text>
            </Pressable>
          ))}
        </View>

        {/* AI mode */}
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

        {/* Manual mode */}
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

            {/* Planner map — tap to add waypoints */}
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
                      if (msg.type === "tap") {
                        handleMapTap(msg.lat, msg.lng);
                      }
                    } catch {}
                  }}
                />
                <View style={s.mapHintBadge}>
                  <Ionicons name="location-outline" size={12} color="#fff" />
                  <Text style={s.mapHintText}>Tocca per aggiungere tappe</Text>
                </View>
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

              {/* Round trip */}
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
                </View>
              )}

              {/* Multi-day */}
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

              {/* Avoid options */}
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
                    {
                      icon: "time-outline",
                      value: `${Math.floor(routeResult.durationMinutes / 60)}h ${routeResult.durationMinutes % 60}m`,
                      label: "Durata"
                    },
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
});
