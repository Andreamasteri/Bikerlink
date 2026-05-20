import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Linking,
  ActivityIndicator,
} from "react-native";
import WebView from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { buildNavigationMapHtml } from "@/lib/leaflet-navigation-html";
import { getTileConfig } from "@/lib/map-tiles";
import { useLocale, useT } from "@/lib/language-context";
import { decodePolylineTuples as decodePolyline } from "@/lib/polyline";

// ─── Route cache helpers ───────────────────────────────────────────────────────

const ROUTE_CACHE_PREFIX = "route_cache_";

async function saveRouteToCache(route: PlannedRoute): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${ROUTE_CACHE_PREFIX}${route.id}`,
      JSON.stringify(route)
    );
  } catch {}
}

async function loadRouteFromCache(id: string): Promise<PlannedRoute | null> {
  try {
    const raw = await AsyncStorage.getItem(`${ROUTE_CACHE_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as PlannedRoute;
  } catch {
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavigationStep {
  sign: number;
  text: string;
  distance: number;
  time: number;
  interval: [number, number];
  streetName?: string;
}

interface PlannedRoute {
  id: string;
  title: string;
  distanceKm: number;
  durationMinutes: number;
  waypoints: Array<{ lat: number; lng: number; name?: string }>;
  polyline?: string | null;
  navigationSteps?: NavigationStep[] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function closestPointIndexOnPolyline(lat: number, lng: number, polyline: Array<[number, number]>): number {
  let minDist = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < polyline.length; i++) {
    const d = haversineM(lat, lng, polyline[i][0], polyline[i][1]);
    if (d < minDist) { minDist = d; closestIdx = i; }
  }
  return closestIdx;
}

function activeStepIndex(polylineIdx: number, steps: NavigationStep[]): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (polylineIdx >= steps[i].interval[0]) return i;
  }
  return 0;
}

function signToIcon(sign: number): keyof typeof Ionicons.glyphMap {
  switch (sign) {
    case -3: return "return-down-back-outline";
    case -2: return "arrow-back-outline";
    case -1: return "arrow-back-circle-outline";
    case 0: return "arrow-up-outline";
    case 1: return "arrow-forward-circle-outline";
    case 2: return "arrow-forward-outline";
    case 3: return "return-down-forward-outline";
    case 4: return "flag-outline";
    case 6: return "refresh-outline";
    default: return "navigate-outline";
  }
}

function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const TILE_CONFIG = getTileConfig("carto_dark");
const ANNOUNCE_DISTANCE_FAR = 200;
const ANNOUNCE_DISTANCE_NEAR = 50;
const REROUTE_DISTANCE_M = 200;
const REROUTE_DELAY_MS = 5000;

export default function NavigateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const locale = useLocale();
  const t = useT();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const webViewRef = useRef<WebView>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const announcedFarRef = useRef<Set<number>>(new Set());
  const announcedNearRef = useRef<Set<number>>(new Set());

  // Rerouting refs
  const offRouteStartRef = useRef<number | null>(null);
  const isReroutingRef = useRef(false);
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

  const handlePositionUpdate = useCallback((lat: number, lng: number, heading: number) => {
    if (polylinePoints.length === 0) return;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polylinePoints, route, mapReady, isFinished, locale, t]);

  const handleMapMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "mapReady") setMapReady(true);
    } catch {}
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

  const handleClose = () => {
    Speech.stop();
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    router.back();
  };

  const s = styles(colors);

  // Build map HTML — rebuilt whenever polylinePoints change (including after reroute)
  const mapHtml = React.useMemo(() => {
    if (polylinePoints.length < 2) return null;
    const stepsForMap = activeStepsRef.current ?? route?.navigationSteps ?? [];
    const stepPoints = stepsForMap.map((step) => {
      const idx = step.interval[0];
      return idx < polylinePoints.length ? polylinePoints[idx] : polylinePoints[0];
    });
    return buildNavigationMapHtml(TILE_CONFIG.urlTemplate, polylinePoints, stepPoints);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polylinePoints, route?.navigationSteps]);

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
      <View style={[s.container, { paddingTop: topPad, paddingBottom: bottomPad }]}>
        <View style={s.finishedContainer}>
          <MaterialCommunityIcons name="flag-checkered" size={72} color={colors.accent} />
          <Text style={s.finishedTitle}>{t("nav.arrived")}</Text>
          <Text style={s.finishedSub}>{route.title}</Text>
          <Text style={s.finishedStats}>{route.distanceKm} km · {formatDuration(route.durationMinutes)}</Text>
          <View style={s.finishedActions}>
            <Pressable
              style={[s.finishedBtn, { backgroundColor: colors.accent }]}
              onPress={() => router.replace(`/route/tracking` as any)}
            >
              <MaterialCommunityIcons name="record-circle" size={18} color="#fff" />
              <Text style={s.finishedBtnText}>{t("nav.save_ride")}</Text>
            </Pressable>
            <Pressable style={[s.finishedBtn, { backgroundColor: colors.surface }]} onPress={handleClose}>
              <Ionicons name="close" size={18} color={colors.text} />
              <Text style={[s.finishedBtnText, { color: colors.text }]}>{t("nav.close")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const steps = activeStepsRef.current ?? route.navigationSteps ?? [];
  const step = steps[currentStep];

  return (
    <View style={s.container}>
      {/* Map */}
      <View style={s.mapContainer}>
        {mapHtml ? (
          <WebView
            ref={webViewRef}
            source={{ html: mapHtml, baseUrl: "" }}
            style={s.map}
            javaScriptEnabled
            originWhitelist={["*"]}
            onMessage={handleMapMessage}
            scrollEnabled={false}
          />
        ) : (
          <View style={[s.map, { justifyContent: "center", alignItems: "center", backgroundColor: colors.surface }]}>
            <MaterialCommunityIcons name="map-outline" size={40} color={colors.border} />
            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>{t("nav.map_unavailable")}</Text>
          </View>
        )}

        {/* Close button */}
        <Pressable style={[s.closeBtn, { top: topPad + 8 }]} onPress={handleClose} hitSlop={12}>
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>

        {/* Rerouting banner */}
        {isRerouting && (
          <View style={s.reroutingBanner}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={s.reroutingText}>{t("nav.rerouting")}</Text>
          </View>
        )}

        {/* Remaining info badge */}
        {remainingKm !== null && (
          <View style={s.remainingBadge}>
            <Text style={s.remainingKm}>{remainingKm.toFixed(1)} km</Text>
            {remainingMin !== null && (
              <Text style={s.remainingMin}>{formatDuration(remainingMin)}</Text>
            )}
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={s.progressBg}>
        <View style={[s.progressFill, { width: `${progressPct}%` as any }]} />
      </View>

      {/* Offline banner */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={s.offlineBannerText}>Modalità offline — percorso in cache</Text>
        </View>
      )}

      {/* Instruction panel */}
      <View style={[s.panel, { paddingBottom: bottomPad + 8 }]}>
        {step ? (
          <>
            <View style={s.stepRow}>
              <View style={s.stepIcon}>
                <Ionicons name={signToIcon(step.sign)} size={32} color={colors.accent} />
              </View>
              <View style={s.stepInfo}>
                <Text style={s.stepText} numberOfLines={2}>{step.text}</Text>
                {step.streetName ? (
                  <Text style={s.stepStreet} numberOfLines={1}>{step.streetName}</Text>
                ) : null}
                {distanceToNext !== null && (
                  <Text style={s.stepDistance}>{formatDistance(distanceToNext)}</Text>
                )}
              </View>
            </View>

            {/* Next step preview */}
            {steps[currentStep + 1] && (
              <View style={s.nextStepRow}>
                <Ionicons name={signToIcon(steps[currentStep + 1].sign)} size={14} color={colors.textSecondary} />
                <Text style={s.nextStepText} numberOfLines={1}>
                  {t("nav.then")} {steps[currentStep + 1].text}
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={s.stepRow}>
            <MaterialCommunityIcons name="navigation-outline" size={32} color={colors.accent} />
            <Text style={s.stepText}>{t("nav.in_progress")}</Text>
          </View>
        )}

        {/* Open in external apps */}
        <View style={s.externalRow}>
          <Pressable style={s.externalBtn} onPress={handleOpenInGoogleMaps}>
            <MaterialCommunityIcons name="google-maps" size={16} color={colors.textSecondary} />
            <Text style={s.externalLabel}>Google Maps</Text>
          </Pressable>
          <Pressable style={s.externalBtn} onPress={handleOpenInWaze}>
            <MaterialCommunityIcons name="waze" size={16} color={colors.textSecondary} />
            <Text style={s.externalLabel}>Waze</Text>
          </Pressable>
          {Platform.OS === "ios" && (
            <Pressable style={s.externalBtn} onPress={handleOpenInAppleMaps}>
              <Ionicons name="map-outline" size={16} color={colors.textSecondary} />
              <Text style={s.externalLabel}>Apple Maps</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapContainer: { flex: 1, position: "relative" },
  map: { flex: 1 },
  closeBtn: {
    position: "absolute",
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  remainingBadge: {
    position: "absolute",
    top: 60,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    minWidth: 70,
  },
  remainingKm: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  remainingMin: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  reroutingBanner: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.82)",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  reroutingText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  progressBg: { height: 4, backgroundColor: colors.border },
  progressFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
  panel: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.accent + "22",
    justifyContent: "center",
    alignItems: "center",
  },
  stepInfo: { flex: 1 },
  stepText: { fontFamily: "Inter_700Bold", fontSize: 17, color: colors.text },
  stepStreet: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  stepDistance: { fontFamily: "Inter_600SemiBold", fontSize: 20, color: colors.accent, marginTop: 4 },
  nextStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  nextStepText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, flex: 1 },
  externalRow: { flexDirection: "row", gap: 8, paddingTop: 4 },
  externalBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  externalLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary },
  finishedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  finishedTitle: { fontFamily: "Inter_700Bold", fontSize: 32, color: colors.text },
  finishedSub: { fontFamily: "Inter_500Medium", fontSize: 16, color: colors.textSecondary, textAlign: "center" },
  finishedStats: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.textSecondary },
  finishedActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  finishedBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  finishedBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#c0392b",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  offlineBannerText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#fff" },
});
