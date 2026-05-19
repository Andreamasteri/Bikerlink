import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
} from "react-native";
import WebView from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { buildLeafletCurvatureGradientHtml } from "@/lib/leaflet-route-map-html";
import { getTileConfig } from "@/lib/map-tiles";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Waypoint { lat: number; lng: number; name?: string; }

interface WeatherWaypoint {
  lat: number; lng: number; name: string;
  tempMax: number | null; tempMin: number | null; tempNow: number | null;
  precipitation: number; windSpeed: number | null; precipProb: number;
  weatherCode: number; weatherDesc: string; isSuitable: boolean;
}

interface POI {
  id: number; lat: number; lng: number; type: string;
  name: string | null; brand: string | null;
}

interface CompatibleBiker {
  userId: string; nickname: string; userType: string;
  avatarUrl: string | null; ridingStyle: string | null;
  isAvailable: boolean; distanceKm: number | null;
}

interface PlannedRoute {
  id: string; userId: string; title: string;
  description?: string | null; distanceKm: number; durationMinutes: number;
  bikerScore: number; style: "curvy" | "balanced" | "fast";
  visibility: "public" | "private"; isMultiDay: boolean;
  waypoints: Waypoint[]; polyline?: string | null;
  metadata?: Record<string, unknown>; createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weatherIcon(code: number): keyof typeof Ionicons.glyphMap {
  if (code === 0) return "sunny-outline";
  if (code <= 3) return "partly-sunny-outline";
  if (code <= 9) return "cloud-outline";
  if (code <= 59) return "rainy-outline";
  if (code <= 79) return "snow-outline";
  if (code <= 99) return "thunderstorm-outline";
  return "cloud-outline";
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function bikerScoreColor(score: number, colors: any): string {
  if (score >= 0.7) return "#22c55e";
  if (score >= 0.4) return colors.accent;
  return colors.textSecondary;
}

function poiTypeLabel(type: string): string {
  const map: Record<string, string> = {
    fuel: "Distributore", restaurant: "Ristorante", cafe: "Bar",
    hotel: "Hotel", viewpoint: "Panorama",
  };
  return map[type] ?? type;
}

function poiTypeIcon(type: string): keyof typeof Ionicons.glyphMap {
  if (type === "fuel") return "flame-outline";
  if (type === "restaurant") return "restaurant-outline";
  if (type === "cafe") return "cafe-outline";
  if (type === "hotel") return "bed-outline";
  if (type === "viewpoint") return "eye-outline";
  return "location-outline";
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

const TILE_CONFIG = getTileConfig("carto_dark");

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GiriDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [weather, setWeather] = useState<WeatherWaypoint[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [pois, setPois] = useState<POI[] | null>(null);
  const [poisLoading, setPoisLoading] = useState(false);
  const [matchBikers, setMatchBikers] = useState<CompatibleBiker[] | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [hotels, setHotels] = useState<any[] | null>(null);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const [matchBannerDismissed, setMatchBannerDismissed] = useState(false);

  const { data: route, isLoading } = useQuery<PlannedRoute>({
    queryKey: ["/api/planned-routes", id],
    queryFn: async () => {
      const resp = await apiRequest("GET", `/api/planned-routes/${id}`);
      return resp.json();
    },
    enabled: !!id,
  });

  // Auto-load compatible bikers when route loads (proactive matching)
  React.useEffect(() => {
    if (route && !matchBikers && !matchLoading) {
      handleFindBikers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id]);

  // Auto-load hotel suggestions for multi-day routes
  React.useEffect(() => {
    if (route?.isMultiDay && !hotels && !hotelsLoading) {
      handleLoadHotels();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id, route?.isMultiDay]);

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/planned-routes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/planned-routes"] });
      router.replace("/(tabs)/giri" as any);
    },
    onError: () => Alert.alert("Errore", "Impossibile eliminare il giro."),
  });

  // Map HTML — decoded polyline or waypoint dots
  const mapHtml = useMemo(() => {
    if (!route) return null;
    let points: Array<{ lat: number; lng: number }> = [];
    if (route.polyline) {
      points = decodePolyline(route.polyline);
    } else if (route.waypoints?.length) {
      points = route.waypoints
        .filter((wp) => wp.lat !== 0 || wp.lng !== 0)
        .map((wp) => ({ lat: wp.lat, lng: wp.lng }));
    }
    if (!points.length) return null;
    return buildLeafletCurvatureGradientHtml(TILE_CONFIG.urlTemplate, TILE_CONFIG.maximumZ, points);
  }, [route]);

  // Multi-day segments computed from metadata
  const multiDayDays = useMemo(() => {
    if (!route?.isMultiDay) return null;
    const meta = route.metadata ?? {};
    const daysCount = (meta.daysCount as number) ?? 2;
    const waypoints = route.waypoints?.filter((wp) => wp.lat !== 0 || wp.lng !== 0) ?? [];
    if (!waypoints.length || daysCount < 2) return null;
    const kmPerDay = Math.round((route.distanceKm / daysCount) * 10) / 10;
    const minPerDay = Math.round(route.durationMinutes / daysCount);
    const wpPerDay = Math.max(1, Math.floor(waypoints.length / daysCount));
    return Array.from({ length: daysCount }, (_, day) => {
      const startIdx = day * wpPerDay;
      const endIdx = day === daysCount - 1 ? waypoints.length - 1 : Math.min((day + 1) * wpPerDay, waypoints.length - 1);
      return {
        day: day + 1,
        from: waypoints[startIdx]?.name ?? `Tappa ${startIdx + 1}`,
        to: waypoints[endIdx]?.name ?? `Tappa ${endIdx + 1}`,
        km: kmPerDay,
        minutes: minPerDay,
      };
    });
  }, [route]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleLoadWeather = async () => {
    if (!route?.waypoints?.length) return;
    setWeatherLoading(true);
    try {
      const departure = new Date(Date.now() + 3600_000).toISOString();
      const url = new URL(`/api/planned-routes/weather/${id}`, getApiUrl());
      url.searchParams.set("departureTime", departure);
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setWeather((data.waypoints ?? []).filter(Boolean));
    } catch {
      // fallback to POST
      try {
        const fallbackUrl = new URL("/api/planned-routes/weather", getApiUrl());
        const resp = await fetch(fallbackUrl.toString(), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            waypoints: route.waypoints,
            departureTime: new Date(Date.now() + 3600_000).toISOString(),
          }),
        });
        if (!resp.ok) throw new Error();
        const data = await resp.json();
        setWeather((data.waypoints ?? []).filter(Boolean));
      } catch {
        Alert.alert("Meteo", "Meteo temporaneamente non disponibile.");
      }
    } finally { setWeatherLoading(false); }
  };

  const handleLoadPOI = async () => {
    if (!route?.waypoints?.length) return;
    setPoisLoading(true);
    try {
      const lats = route.waypoints.map((wp) => wp.lat).filter((l) => l !== 0);
      const lngs = route.waypoints.map((wp) => wp.lng).filter((l) => l !== 0);
      if (!lats.length) { setPoisLoading(false); return; }
      const url = new URL("/api/planned-routes/poi", getApiUrl());
      url.searchParams.set("minLat", String(Math.min(...lats) - 0.3));
      url.searchParams.set("maxLat", String(Math.max(...lats) + 0.3));
      url.searchParams.set("minLng", String(Math.min(...lngs) - 0.3));
      url.searchParams.set("maxLng", String(Math.max(...lngs) + 0.3));
      url.searchParams.set("types", "fuel,rest,viewpoint,hotel");
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setPois(data.pois ?? []);
    } catch {
      Alert.alert("POI", "POI temporaneamente non disponibile.");
    } finally { setPoisLoading(false); }
  };

  const handleFindBikers = async () => {
    if (!id) return;
    setMatchLoading(true);
    try {
      const url = new URL(`/api/planned-routes/compatible-bikers/${id}`, getApiUrl());
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setMatchBikers(data.bikers ?? []);
    } catch {
      setMatchBikers([]);
    } finally { setMatchLoading(false); }
  };

  const handleLoadHotels = async () => {
    if (!route?.isMultiDay || !route.waypoints?.length) return;
    setHotelsLoading(true);
    try {
      const wps = route.waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
      if (!wps.length) { setHotelsLoading(false); return; }
      const meta = route.metadata ?? {};
      const daysCount = Number(meta.daysCount ?? 2);
      const wpPerDay = Math.max(1, Math.floor(wps.length / daysCount));
      const dayEndPoints = Array.from({ length: daysCount - 1 }, (_, i) => {
        const endIdx = Math.min((i + 1) * wpPerDay, wps.length - 1);
        return { lat: wps[endIdx].lat, lng: wps[endIdx].lng, name: wps[endIdx].name ?? `Tappa ${i + 1}` };
      });
      if (!dayEndPoints.length) { setHotelsLoading(false); return; }
      const url = new URL("/api/planned-routes/hotels", getApiUrl());
      const resp = await fetch(url.toString(), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayEndPoints, nights: 1 }),
      });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setHotels(data.days ?? []);
    } catch {
      setHotels([]);
    } finally { setHotelsLoading(false); }
  };

  const handleExportGPX = () => {
    const url = new URL(`/api/planned-routes/${id}/export.gpx`, getApiUrl());
    Linking.openURL(url.toString());
  };

  const handleDelete = () => {
    Alert.alert("Elimina giro", "Vuoi davvero eliminare questo giro pianificato?", [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  };

  const s = styles(colors);
  const isOwner = user?.id === route?.userId;
  const scoreColor = route ? bikerScoreColor(route.bikerScore, colors) : colors.accent;

  if (isLoading) {
    return (
      <View style={[s.container, { paddingTop: topPad, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!route) {
    return (
      <View style={[s.container, { paddingTop: topPad }]}>
        <View style={s.nav}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={s.emptyText}>Percorso non trovato</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      {/* Nav */}
      <View style={s.nav}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.navTitle} numberOfLines={1}>{route.title}</Text>
        {isOwner && (
          <Pressable onPress={handleDelete} hitSlop={12} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={20} color={colors.accentRed} />
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Map */}
        {mapHtml ? (
          <View style={s.mapContainer}>
            <WebView
              source={{ html: mapHtml, baseUrl: "" }}
              style={s.map}
              scrollEnabled={false}
              javaScriptEnabled
              originWhitelist={["*"]}
            />
            <View style={s.mapOverlayBadge}>
              <MaterialCommunityIcons
                name={route.style === "curvy" ? "road-variant" : route.style === "fast" ? "rocket-launch-outline" : "scale-balance"}
                size={12}
                color="#fff"
              />
              <Text style={s.mapOverlayText}>{route.distanceKm} km</Text>
            </View>
          </View>
        ) : (
          <View style={s.mapPlaceholder}>
            <MaterialCommunityIcons name="map-outline" size={40} color={colors.border} />
            <Text style={s.mapPlaceholderText}>Mappa non disponibile</Text>
          </View>
        )}

        {/* Hero stats */}
        <View style={s.heroCard}>
          <View style={s.heroStats}>
            {[
              { value: String(route.distanceKm), unit: "km", label: "Distanza" },
              { value: String(Math.floor(route.durationMinutes / 60)), unit: `h ${route.durationMinutes % 60}m`, label: "Durata" },
              { value: String(Math.round(route.bikerScore * 100)), unit: "/100", label: "BikerScore", color: scoreColor },
            ].map((stat, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={s.heroDivider} />}
                <View style={s.heroStat}>
                  <Text style={[s.heroValue, stat.color ? { color: stat.color } : {}]}>{stat.value}</Text>
                  <Text style={s.heroUnit}>{stat.unit}</Text>
                  <Text style={s.heroLabel}>{stat.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          <View style={s.bsBarBg}>
            <View style={[s.bsBarFill, { width: `${Math.round(route.bikerScore * 100)}%` as any, backgroundColor: scoreColor }]} />
          </View>

          <View style={s.metaRow}>
            <View style={s.metaBadge}>
              <MaterialCommunityIcons
                name={route.style === "curvy" ? "road-variant" : route.style === "fast" ? "rocket-launch-outline" : "scale-balance"}
                size={13} color={colors.accent}
              />
              <Text style={s.metaBadgeText}>
                {route.style === "curvy" ? "Curvy" : route.style === "fast" ? "Veloce" : "Bilanciato"}
              </Text>
            </View>
            {route.isMultiDay && (
              <View style={[s.metaBadge, { backgroundColor: "#7c3aed22" }]}>
                <Ionicons name="calendar-outline" size={13} color="#a78bfa" />
                <Text style={[s.metaBadgeText, { color: "#a78bfa" }]}>
                  Multi-giorno
                  {(route.metadata?.daysCount) ? ` · ${route.metadata.daysCount}gg` : ""}
                </Text>
              </View>
            )}
            <View style={s.metaBadge}>
              <Ionicons name={route.visibility === "public" ? "globe-outline" : "lock-closed-outline"} size={13} color={colors.textSecondary} />
              <Text style={s.metaBadgeText}>{route.visibility === "public" ? "Pubblico" : "Privato"}</Text>
            </View>
          </View>
        </View>

        {/* Biker matching banner — proactive, auto-loaded */}
        {matchBikers && matchBikers.length > 0 && !matchBannerDismissed && (
          <View style={s.matchBanner}>
            <MaterialCommunityIcons name="account-group" size={20} color={colors.accent} />
            <Text style={s.matchBannerText}>
              {matchBikers.length === 1
                ? "1 biker compatibile trovato vicino al percorso!"
                : `${matchBikers.length} bikers compatibili trovati vicino al percorso!`}
            </Text>
            <Pressable onPress={() => setMatchBannerDismissed(true)} hitSlop={12}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        {/* Multi-day timeline */}
        {route.isMultiDay && multiDayDays && multiDayDays.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Tappe giornaliere</Text>
            {multiDayDays.map((day, i) => (
              <View key={i} style={s.dayCard}>
                <View style={s.dayBadge}>
                  <Text style={s.dayBadgeText}>Giorno {day.day}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.dayRoute}>
                    <Ionicons name="ellipse" size={8} color="#22c55e" />
                    <Text style={s.dayRouteText} numberOfLines={1}>{day.from}</Text>
                  </View>
                  <View style={s.dayRouteLine} />
                  <View style={s.dayRoute}>
                    <Ionicons name="ellipse" size={8} color={colors.accentRed} />
                    <Text style={s.dayRouteText} numberOfLines={1}>{day.to}</Text>
                  </View>
                </View>
                <View style={s.dayStats}>
                  <Text style={s.dayStatValue}>{day.km} km</Text>
                  <Text style={s.dayStatLabel}>{formatDuration(day.minutes)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Waypoints */}
        {route.waypoints?.length > 0 && !route.isMultiDay && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Tappe</Text>
            {route.waypoints.map((wp, i) => (
              <View key={i} style={s.wpRow}>
                <View style={[s.wpDot, {
                  backgroundColor: i === 0 ? "#22c55e" : i === route.waypoints.length - 1 ? colors.accentRed : colors.accent,
                }]} />
                <Text style={s.wpText}>{wp.name ?? `Tappa ${i + 1}`}</Text>
                {i < route.waypoints.length - 1 && <View style={s.wpLine} />}
              </View>
            ))}
          </View>
        )}

        {/* Action grid */}
        <View style={s.actionsGrid}>
          <Pressable style={s.actionCard} onPress={handleLoadWeather} disabled={weatherLoading}>
            {weatherLoading ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons name="cloud-outline" size={24} color={colors.accent} />}
            <Text style={s.actionLabel}>Meteo</Text>
          </Pressable>
          <Pressable style={s.actionCard} onPress={handleLoadPOI} disabled={poisLoading}>
            {poisLoading ? <ActivityIndicator color={colors.accent} size="small" /> : <MaterialCommunityIcons name="gas-station" size={24} color={colors.accent} />}
            <Text style={s.actionLabel}>POI</Text>
          </Pressable>
          <Pressable style={s.actionCard} onPress={handleFindBikers} disabled={matchLoading}>
            {matchLoading ? <ActivityIndicator color={colors.accent} size="small" /> : <MaterialCommunityIcons name="account-group" size={24} color={colors.accent} />}
            <Text style={s.actionLabel}>Bikers</Text>
          </Pressable>
          <Pressable style={s.actionCard} onPress={handleExportGPX}>
            <MaterialCommunityIcons name="download-outline" size={24} color={colors.accent} />
            <Text style={s.actionLabel}>GPX</Text>
          </Pressable>
        </View>

        {/* Weather */}
        {weather && weather.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Meteo lungo il percorso</Text>
            {!weather.every((w) => w.isSuitable) && (
              <View style={s.weatherAlert}>
                <Ionicons name="warning-outline" size={16} color={colors.accentRed} />
                <Text style={s.weatherAlertText}>Condizioni non ideali in alcune tappe</Text>
              </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {weather.map((w, i) => (
                <View key={i} style={[s.weatherCard, !w.isSuitable && s.weatherBad]}>
                  <Text style={s.weatherName} numberOfLines={1}>{w.name || `Tappa ${i + 1}`}</Text>
                  <Ionicons name={weatherIcon(w.weatherCode)} size={28} color={w.isSuitable ? colors.accent : colors.accentRed} />
                  <Text style={s.weatherDesc}>{w.weatherDesc}</Text>
                  {w.tempNow !== null && <Text style={s.weatherTemp}>{Math.round(w.tempNow)}°C</Text>}
                  {w.precipProb > 0 && <Text style={s.weatherRain}>💧 {w.precipProb}%</Text>}
                  {w.windSpeed !== null && <Text style={s.weatherWind}>💨 {Math.round(w.windSpeed)} km/h</Text>}
                  <View style={[s.suitableDot, { backgroundColor: w.isSuitable ? "#22c55e" : colors.accentRed }]} />
                  <Text style={[s.suitableText, { color: w.isSuitable ? "#22c55e" : colors.accentRed }]}>
                    {w.isSuitable ? "OK moto" : "Attenzione"}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Fuel-stop timeline */}
        {route.distanceKm > 0 && (() => {
          const autonomyKm = 250;
          const stopCount = Math.floor(route.distanceKm / autonomyKm);
          if (stopCount === 0) return null;
          const avgSpeedKmh = route.style === "curvy" ? 60 : route.style === "fast" ? 90 : 70;
          const stops = Array.from({ length: stopCount }, (_, i) => {
            const km = Math.round((i + 1) * autonomyKm);
            const etaMin = Math.round((km / avgSpeedKmh) * 60);
            const etaH = Math.floor(etaMin / 60);
            const etaM = etaMin % 60;
            return { km, etaLabel: etaM > 0 ? `${etaH}h ${etaM}m` : `${etaH}h` };
          });
          return (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Soste carburante ({stops.length})</Text>
              <View style={{ gap: 0 }}>
                {stops.map((stop, i) => (
                  <View key={i} style={s.fuelStopRow}>
                    <View style={s.fuelStopLeft}>
                      <View style={s.fuelStopDot}>
                        <MaterialCommunityIcons name="gas-station" size={11} color="#fff" />
                      </View>
                      {i < stops.length - 1 && <View style={s.fuelStopLine} />}
                    </View>
                    <View style={s.fuelStopContent}>
                      <Text style={s.fuelStopLabel}>Tappa carburante {i + 1}</Text>
                      <View style={s.fuelStopMeta}>
                        <Text style={s.fuelStopKm}>{stop.km} km</Text>
                        <Text style={s.fuelStopEta}>+{stop.etaLabel} dalla partenza</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* POI */}
        {pois !== null && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Punti di interesse ({pois.length})</Text>
            {pois.length === 0 ? (
              <Text style={s.emptyText}>Nessun POI trovato nella zona</Text>
            ) : (
              <>
                {/* Group by type */}
                {["fuel", "restaurant", "cafe", "hotel", "viewpoint"].map((type) => {
                  const group = pois.filter((p) => p.type === type);
                  if (!group.length) return null;
                  return (
                    <View key={type} style={{ marginBottom: 8 }}>
                      <View style={s.poiGroupHeader}>
                        <Ionicons name={poiTypeIcon(type)} size={14} color={colors.accent} />
                        <Text style={s.poiGroupLabel}>{poiTypeLabel(type)} ({group.length})</Text>
                      </View>
                      {group.slice(0, 5).map((poi, i) => (
                        <View key={i} style={s.poiRow}>
                          <Text style={s.poiName}>{poi.name ?? poi.brand ?? poiTypeLabel(poi.type)}</Text>
                          <Text style={s.poiCoords}>{poi.lat.toFixed(3)}, {poi.lng.toFixed(3)}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* Compatible bikers */}
        {matchBikers !== null && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Bikers nella zona ({matchBikers.length})</Text>
            {matchBikers.length === 0 ? (
              <View style={s.emptyState}>
                <MaterialCommunityIcons name="motorbike-off" size={32} color={colors.border} />
                <Text style={s.emptyText}>Nessun biker compatibile trovato vicino al percorso</Text>
              </View>
            ) : (
              matchBikers.map((biker, i) => (
                <Pressable
                  key={i}
                  style={s.bikerRow}
                  onPress={() => router.push(`/profile/${biker.userId}` as any)}
                >
                  {biker.avatarUrl ? (
                    <Image source={{ uri: biker.avatarUrl }} style={s.bikerAvatar} />
                  ) : (
                    <View style={s.bikerAvatarFallback}>
                      <Text style={s.bikerAvatarText}>{biker.nickname.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.bikerName}>{biker.nickname}</Text>
                    {biker.ridingStyle && <Text style={s.bikerCity}>{biker.ridingStyle}</Text>}
                  </View>
                  {biker.distanceKm !== null && (
                    <Text style={s.bikerDist}>{biker.distanceKm} km</Text>
                  )}
                  {biker.isAvailable && <View style={s.onlineDot} />}
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* Hotel suggestions for multi-day routes */}
        {route.isMultiDay && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Hotel per le soste</Text>
              {hotelsLoading && <ActivityIndicator size="small" color={colors.accent} />}
            </View>
            {!hotels && !hotelsLoading && (
              <Pressable style={s.loadMoreBtn} onPress={handleLoadHotels}>
                <Ionicons name="bed-outline" size={16} color={colors.accent} />
                <Text style={s.loadMoreText}>Cerca hotel lungo il percorso</Text>
              </Pressable>
            )}
            {hotels !== null && hotels.length === 0 && (
              <Text style={s.emptyText}>Nessun hotel trovato per le soste</Text>
            )}
            {hotels !== null && hotels.map((day: any, di: number) => (
              <View key={di} style={s.hotelDayBlock}>
                <Text style={s.hotelDayTitle}>Sosta Giorno {di + 1} — {day.location ?? `Tappa ${di + 1}`}</Text>
                {(day.hotels ?? []).slice(0, 3).map((h: any, hi: number) => (
                  <Pressable
                    key={hi}
                    style={s.hotelCard}
                    onPress={() => h.bookingUrl ? Linking.openURL(h.bookingUrl) : null}
                  >
                    <View style={s.hotelCardLeft}>
                      <Ionicons name="bed-outline" size={20} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.hotelName} numberOfLines={1}>{h.name ?? "Hotel"}</Text>
                      <Text style={s.hotelAddress} numberOfLines={1}>{h.address ?? `${(h.lat ?? 0).toFixed(3)}, ${(h.lng ?? 0).toFixed(3)}`}</Text>
                    </View>
                    {h.bookingUrl && (
                      <View style={s.hotelBookBadge}>
                        <Text style={s.hotelBookText}>Prenota</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Fuel stops info */}
        {Number(route.metadata?.fuelStopsNeeded ?? 0) > 0 && (
          <View style={s.infoCard}>
            <MaterialCommunityIcons name="gas-station" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={s.infoTitle}>Soste carburante consigliate</Text>
              <Text style={s.infoDesc}>{String(route.metadata?.fuelStopsNeeded ?? 0)} sosta/e stimate — usa il tab POI per trovare distributori</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 10 },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  navTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text, flex: 1, textAlign: "center" },
  mapContainer: { height: 200, borderRadius: 14, overflow: "hidden", marginBottom: 14, position: "relative" },
  map: { flex: 1 },
  mapOverlayBadge: { position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  mapOverlayText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  mapPlaceholder: { height: 160, borderRadius: 14, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center", marginBottom: 14, gap: 8 },
  mapPlaceholderText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary },
  heroCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, gap: 12 },
  heroStats: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  heroStat: { alignItems: "center" },
  heroValue: { fontFamily: "Inter_700Bold", fontSize: 28, color: colors.text },
  heroUnit: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: -4 },
  heroLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  heroDivider: { width: 1, height: 50, backgroundColor: colors.border },
  bsBarBg: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  bsBarFill: { height: "100%" as any, borderRadius: 4 },
  metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  metaBadgeText: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary },
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginBottom: 12 },
  dayCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, gap: 12 },
  dayBadge: { backgroundColor: colors.accent + "22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 70, alignItems: "center" },
  dayBadgeText: { fontFamily: "Inter_700Bold", fontSize: 12, color: colors.accent },
  dayRoute: { flexDirection: "row", alignItems: "center", gap: 6 },
  dayRouteText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text, flex: 1 },
  dayRouteLine: { width: 2, height: 12, backgroundColor: colors.border, marginLeft: 3, marginVertical: 2 },
  dayStats: { alignItems: "flex-end" },
  dayStatValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text },
  dayStatLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  wpRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 4 },
  wpDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  wpLine: { position: "absolute", left: 5, top: 16, width: 2, height: 20, backgroundColor: colors.border },
  wpText: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text, flex: 1 },
  actionsGrid: { flexDirection: "row", gap: 10, marginBottom: 20 },
  actionCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 14, alignItems: "center", gap: 6 },
  actionLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.text },
  weatherAlert: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accentRed + "22", borderRadius: 8, padding: 10, marginBottom: 10 },
  weatherAlertText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.accentRed, flex: 1 },
  weatherCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginRight: 10, width: 120, alignItems: "center", gap: 4 },
  weatherBad: { borderWidth: 1, borderColor: colors.accentRed + "55" },
  weatherName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text, textAlign: "center" },
  weatherDesc: { fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary, textAlign: "center" },
  weatherTemp: { fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text },
  weatherRain: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  weatherWind: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  suitableDot: { width: 8, height: 8, borderRadius: 4 },
  suitableText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  poiGroupHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  poiGroupLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary },
  poiRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, paddingLeft: 20 },
  poiName: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text, flex: 1 },
  poiCoords: { fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary },
  bikerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  bikerAvatar: { width: 40, height: 40, borderRadius: 20 },
  bikerAvatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + "33", justifyContent: "center", alignItems: "center" },
  bikerAvatarText: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.accent },
  bikerName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text },
  bikerCity: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  bikerDist: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e" },
  emptyState: { alignItems: "center", paddingVertical: 20, gap: 8 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, textAlign: "center", paddingVertical: 8 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 4 },
  infoTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text },
  infoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  matchBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.accent + "22", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.accent + "44" },
  matchBannerText: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.text, flex: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  loadMoreBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  loadMoreText: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.accent },
  hotelDayBlock: { marginBottom: 16 },
  hotelDayTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  hotelCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8 },
  hotelCardLeft: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent + "22", justifyContent: "center", alignItems: "center" },
  hotelName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text },
  hotelAddress: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  hotelBookBadge: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  hotelBookText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  fuelStopRow: { flexDirection: "row", gap: 12, marginBottom: 0 },
  fuelStopLeft: { alignItems: "center", width: 26 },
  fuelStopDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, justifyContent: "center", alignItems: "center" },
  fuelStopLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  fuelStopContent: { flex: 1, paddingBottom: 14, paddingTop: 4 },
  fuelStopLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text },
  fuelStopMeta: { flexDirection: "row", gap: 10, marginTop: 2 },
  fuelStopKm: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.accent },
  fuelStopEta: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
});
