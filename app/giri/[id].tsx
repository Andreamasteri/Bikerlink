import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  Share,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { buildLeafletCurvatureGradientHtml } from "@/lib/leaflet-route-map-html";
import { getTileConfig } from "@/lib/map-tiles";
import { useOfflineTiles } from "@/hooks/useOfflineTiles";
import { decodePolyline } from "@/lib/polyline";

// Components
import { GiriHeader } from "@/components/giri/detail/GiriHeader";
import { GiriMap } from "@/components/giri/detail/GiriMap";
import { GiriStats } from "@/components/giri/detail/GiriStats";
import { GiriParticipants } from "@/components/giri/detail/GiriParticipants";
import { GiriActions } from "@/components/giri/detail/GiriActions";
import { GiriWaypoints } from "@/components/giri/detail/GiriWaypoints";
import { GiriPOIs } from "@/components/giri/detail/GiriPOIs";
import { GiriWeather } from "@/components/giri/detail/GiriWeather";
import { GiriMultiDayInfo } from "@/components/giri/detail/GiriMultiDayInfo";
import { GiriElevation } from "@/components/giri/detail/GiriElevation";
import { GiriOfflineCard } from "@/components/giri/detail/GiriOfflineCard";

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
  bikerScore: number; realCurvatureScore?: number | null;
  style: "direct" | "fast" | "balanced" | "curvy" | "extra_curvy";
  visibility: "public" | "private"; isMultiDay: boolean;
  waypoints: Waypoint[]; polyline?: string | null;
  metadata?: Record<string, unknown>; createdAt: string;
  elevationProfile?: Array<{ distanceKm: number; altitudeM: number }> | null;
  elevationGainM?: number | null;
  altitudeMinM?: number | null;
  altitudeMaxM?: number | null;
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

function styleLabel(style: string): string {
  const map: Record<string, string> = {
    direct: "Diretto", fast: "Veloce", balanced: "Bilanciato",
    curvy: "Curvy", extra_curvy: "Extra Curvy",
  };
  return map[style] ?? style;
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

  const topPad = insets.top;
  const bottomPad = insets.bottom;

  const [weather, setWeather] = useState<WeatherWaypoint[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [pois, setPois] = useState<POI[] | null>(null);
  const [poisLoading, setPoisLoading] = useState(false);
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [matchBikers, setMatchBikers] = useState<CompatibleBiker[] | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [hotels, setHotels] = useState<any[] | null>(null);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const [matchBannerDismissed, setMatchBannerDismissed] = useState(false);
  const [elevation, setElevation] = useState<any | null>(null);
  const [elevationLoading, setElevationLoading] = useState(false);
  const [elevationError, setElevationError] = useState(false);
  const [streetViewTip, setStreetViewTip] = useState(true);

  const { data: route, isLoading } = useQuery<PlannedRoute>({
    queryKey: ["/api/planned-routes", id],
    queryFn: async () => {
      const resp = await apiRequest("GET", `/api/planned-routes/${id}`);
      return resp.json();
    },
    enabled: !!id,
  });

  const routePoints = useMemo(() => {
    if (!route) return [];
    if (route.polyline) return decodePolyline(route.polyline);
    return (route.waypoints ?? [])
      .filter((wp) => wp.lat !== 0 || wp.lng !== 0)
      .map((wp) => ({ lat: wp.lat, lng: wp.lng }));
  }, [route]);

  const offline = useOfflineTiles(
    route?.id,
    route?.title ?? "",
    routePoints
  );

  React.useEffect(() => {
    if (route && !matchBikers && !matchLoading) {
      handleFindBikers();
    }
  }, [route?.id]);

  React.useEffect(() => {
    if (route?.isMultiDay && !hotels && !hotelsLoading) {
      handleLoadHotels();
    }
  }, [route?.id, route?.isMultiDay]);

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/planned-routes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/planned-routes"] });
      router.replace("/(tabs)/giri" as any);
    },
    onError: () => Alert.alert("Errore", "Impossibile eliminare il giro."),
  });

  const mapHtml = useMemo(() => {
    if (!routePoints.length) return null;
    return buildLeafletCurvatureGradientHtml(
      TILE_CONFIG.urlTemplate,
      TILE_CONFIG.maximumZ,
      routePoints,
      offline.offlineTileBasePath
    );
  }, [routePoints, offline.offlineTileBasePath]);

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

  const handleWebViewMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "routeTap" && msg.lat && msg.lng) {
        const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${msg.lat},${msg.lng}`;
        Alert.alert(
          "Vedi la strada",
          "Apri Google Street View per pre-visualizzare il manto stradale in questo punto?",
          [
            { text: "Annulla", style: "cancel" },
            { text: "Apri Street View", onPress: () => Linking.openURL(url) },
          ]
        );
        setStreetViewTip(false);
      }
    } catch {}
  };

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
      try {
        const fallbackUrl = new URL("/api/planned-routes/weather", getApiUrl());
        const resp = await fetch(fallbackUrl.toString(), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            waypoints: route!.waypoints,
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

  const handleLoadElevation = async () => {
    if (!id) return;
    setElevationLoading(true);
    setElevationError(false);
    try {
      const url = new URL(`/api/planned-routes/${id}/elevation`, getApiUrl());
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setElevation(data);
    } catch {
      setElevationError(true);
    } finally {
      setElevationLoading(false);
    }
  };

  const handleExportGPX = () => {
    const url = new URL(`/api/planned-routes/${id}/export.gpx`, getApiUrl());
    Linking.openURL(url.toString());
  };

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

  const handleDelete = () => {
    Alert.alert("Elimina giro", "Vuoi davvero eliminare questo giro pianificato?", [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  };

  const handleShare = async () => {
    if (!route) return;
    try {
      await Share.share({
        message: `Guarda questo giro su BikerLink: ${route.title}\n${route.distanceKm}km, Score: ${Math.round(route.bikerScore * 100)}%`,
        url: `${process.env.EXPO_PUBLIC_DOMAIN}/giri/${route.id}`,
      });
    } catch {}
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
        <GiriHeader
          title="Percorso non trovato"
          isOwner={false}
          onBack={() => router.back()}
          onDelete={() => {}}
        />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={s.emptyText}>Percorso non trovato</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <GiriHeader
        title={route.title}
        isOwner={isOwner}
        onBack={() => router.back()}
        onDelete={handleDelete}
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <GiriMap
          mapHtml={mapHtml}
          style={route.style}
          distanceKm={route.distanceKm}
          offlineStatus={offline.status}
          streetViewTip={streetViewTip}
          onMessage={handleWebViewMessage}
        />

        <GiriStats
          distanceKm={route.distanceKm}
          durationMinutes={route.durationMinutes}
          bikerScore={route.bikerScore}
          scoreColor={scoreColor}
          styleLabel={styleLabel(route.style)}
          isMultiDay={route.isMultiDay}
          elevationGainM={route.elevationGainM}
          altitudeMinM={route.altitudeMinM}
          altitudeMaxM={route.altitudeMaxM}
          realCurvatureScore={route.realCurvatureScore}
          onLoadElevation={handleLoadElevation}
          elevationLoading={elevationLoading}
        />

        <GiriActions
          onNavigate={() => router.push(`/navigate/${id}` as any)}
          onOpenGoogleMaps={handleOpenInGoogleMaps}
          onOpenWaze={handleOpenInWaze}
          onOpenAppleMaps={handleOpenInAppleMaps}
          onExportGPX={handleExportGPX}
          onShare={handleShare}
        />

        <GiriOfflineCard
          status={offline.status as "none" | "downloading" | "available"}
          progress={offline.progress}
          onDownload={offline.startDownload}
          onCancel={offline.cancelDownload}
          onDelete={offline.deleteOffline}
        />

        <GiriElevation
          elevation={elevation}
          elevationLoading={elevationLoading}
          elevationError={elevationError}
          onLoadElevation={handleLoadElevation}
        />

        {weather && <GiriWeather weather={weather} weatherIcon={weatherIcon} />}
        {!weather && (
          <Pressable style={s.loadMoreBtn} onPress={handleLoadWeather} disabled={weatherLoading}>
            <Ionicons name="cloud-outline" size={16} color={colors.accent} />
            <Text style={s.loadMoreText}>{weatherLoading ? "Caricamento meteo..." : "Carica previsioni lungo il percorso"}</Text>
          </Pressable>
        )}

        <GiriWaypoints waypoints={route.waypoints} />

        <GiriPOIs
          pois={pois}
          poisLoading={poisLoading}
          onLoadPOIs={handleLoadPOI}
          selectedPOI={selectedPOI}
          onSelectPOI={setSelectedPOI}
          poiTypeLabel={poiTypeLabel}
          poiTypeIcon={poiTypeIcon}
        />

        <GiriParticipants
          matchBikers={matchBikers}
          matchLoading={matchLoading}
          matchBannerDismissed={matchBannerDismissed}
          onDismissBanner={() => setMatchBannerDismissed(true)}
          onFindBikers={handleFindBikers}
          onPressBiker={(uid) => router.push(`/profile/${uid}` as any)}
        />

        {multiDayDays && (
          <GiriMultiDayInfo
            days={multiDayDays}
            hotels={hotels}
            hotelsLoading={hotelsLoading}
            onLoadHotels={handleLoadHotels}
          />
        )}

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

const styles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary, textAlign: "center", paddingVertical: 8 },
  loadMoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  loadMoreText: { fontFamily: "Inter_500Medium", fontSize: 14, color: colors.accent },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 4 },
  infoTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text },
  infoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});
