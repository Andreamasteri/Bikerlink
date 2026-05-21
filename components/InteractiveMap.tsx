import React, { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  View,
  StyleSheet,

  TouchableOpacity,
  Text,
  ActivityIndicator,
} from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig, type MapProvider } from "@/lib/map-tiles";
import { apiRequest, queryClient } from "@/lib/query-client";
import { LEAFLET_MAP_HTML } from "@/lib/leaflet-map-html";

export interface MapUser {
  id: string;
  nickname: string;
  userType: "biker" | "zavorrina" | "coppia";
  sex?: string | null;
  country?: string | null;
  region?: string | null;
  latitude: number;
  longitude: number;
}

export interface MapWorkshop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isSynecoPartner: boolean;
}

export interface MapEasterEgg {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface MapSosRequest {
  id: string;
  requesterNickname?: string;
  reason: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

interface EventMapPin {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  eventDate: string;
}

export interface ClubMapPin {
  id: string;
  name: string;
  clubType: string;
  logoUrl: string | null;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  isFictitious: boolean;
  memberCount: number;
  currentUserIsMember?: boolean;
}

interface InteractiveMapProps {
  users?: MapUser[];
  workshops?: MapWorkshop[];
  easterEggs?: MapEasterEgg[];
  activeSosRequests?: MapSosRequest[];
  isAvailable: boolean;
  ghostMode?: boolean;
  searchRadiusKm?: number;
  filterBiker: boolean;
  filterZavorrina: boolean;
  filterBarTopOffset?: number;
  onToggleFilterBiker: () => void;
  onToggleFilterZavorrina: () => void;
  onUserPress?: (user: MapUser) => void;
  onEasterEggPress?: (egg: MapEasterEgg) => void;
  onReady?: () => void;
  currentUserId?: string | null;
  realMeMarker?: LatLng | null;
  fakeMeMarker?: LatLng | null;
  onEventPress?: (eventId: string) => void;
  showEventPins?: boolean;
  clubPins?: ClubMapPin[];
  filterClubs?: boolean;
  onToggleFilterClubs?: () => void;
  filterEvents?: boolean;
  onToggleFilterEvents?: () => void;
  onClubPress?: (club: ClubMapPin) => void;
  onProposeClubLocation?: (club: ClubMapPin) => void;
  initialCenterOverride?: { latitude: number; longitude: number } | null;
  onRegionChangeComplete?: (center: { latitude: number; longitude: number }) => void;
  gpsFollowupEnabled?: boolean;
}

export interface InteractiveMapHandle {
  focusOnCoordinate: (coords: { latitude: number; longitude: number }) => void;
}

const InteractiveMap = forwardRef<InteractiveMapHandle, InteractiveMapProps>(function InteractiveMap({
  users = [],
  workshops = [],
  easterEggs = [],
  activeSosRequests = [],
  isAvailable,
  ghostMode = false,
  searchRadiusKm,
  filterBiker,
  filterZavorrina,
  filterBarTopOffset,
  onToggleFilterBiker,
  onToggleFilterZavorrina,
  onUserPress,
  onEasterEggPress,
  onReady,
  currentUserId,
  realMeMarker,
  fakeMeMarker,
  onEventPress,
  showEventPins = true,
  clubPins = [],
  filterClubs = true,
  onToggleFilterClubs,
  filterEvents = true,
  onToggleFilterEvents,
  onClubPress,
  onProposeClubLocation,
  initialCenterOverride,
  onRegionChangeComplete,
  gpsFollowupEnabled = false,
}: InteractiveMapProps, ref) {
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const initialCenterDoneRef = useRef(false);
  const gpsCenterDoneRef = useRef(false);

  useEffect(() => {
    sendStartupBeacon("interactive_map_mount");
  }, []);

  const today = new Date().toISOString().substring(0, 10);
  const { data: eventPinsRaw } = useQuery<EventMapPin[]>({
    queryKey: ["/api/events/map"],
    enabled: showEventPins,
    select: (d) => {
      if (!d) return [];
      return (d as EventMapPin[]).filter(
        (e) => e.latitude != null && e.longitude != null && (e.eventDate ?? "").substring(0, 10) >= today
      );
    },
  });
  const eventPins = eventPinsRaw ?? [];

  const saveMapStyleMutation = useMutation({
    mutationFn: async (style: MapProvider) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", { preferredMapStyle: style });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
  });

  const handleToggleDayNight = useCallback(() => {
    const next: MapProvider = resolvedProvider === "carto_light" ? "carto_dark" : "carto_light";
    saveMapStyleMutation.mutate(next);
  }, [resolvedProvider, saveMapStyleMutation]);

  const showDayNightButton = mapsEnabled &&
    (resolvedProvider === "carto_light" || resolvedProvider === "carto_dark");

  useEffect(() => {
    let cancelled = false;
    let watchSub: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;
          if (status === "granted") {
            watchSub = await Location.watchPositionAsync(
              { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
              (loc) => {
                if (cancelled) return;
                setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
                setLocationLoading(false);
              }
            );
          } else {
            if (!cancelled) setLocationLoading(false);
          }
      } catch {
        if (!cancelled) setLocationLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      watchSub?.remove();
    };
  }, []);

  const filteredUsers = users.filter((u) => {
    if (currentUserId != null && u.id === currentUserId) return true;
    if (u.userType === "biker" && !filterBiker) return false;
    if (u.userType === "zavorrina" && !filterZavorrina) return false;
    return true;
  });

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  const buildAndPushState = useCallback(() => {
    if (!mapReady) return;
    const tileConfig = mapsEnabled ? getTileConfig(resolvedProvider) : getTileConfig("carto_dark");
    const state = {
      tileUrl: tileConfig.urlTemplate,
      tileMaxZoom: tileConfig.maximumZ,
      userLocation: userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null,
      searchRadius: isAvailable && userLocation && searchRadiusKm && searchRadiusKm > 0
        ? { lat: userLocation.latitude, lng: userLocation.longitude, km: searchRadiusKm }
        : null,
      markers: {
        users: filteredUsers.map((u) => ({
          id: u.id,
          lat: u.latitude,
          lng: u.longitude,
          userType: u.userType,
          sex: u.sex ?? null,
          nickname: u.nickname,
          country: u.country ?? null,
          isCurrentUser: currentUserId != null && u.id === currentUserId,
        })),
        workshops: workshops.map((ws) => ({
          id: ws.id, lat: ws.latitude, lng: ws.longitude, name: ws.name,
        })),
        events: showEventPins && filterEvents ? eventPins.map((ep) => ({
          id: ep.id, lat: ep.latitude, lng: ep.longitude, title: ep.title,
        })) : [],
        clubs: filterClubs ? clubPins.map((c) => ({
          id: c.id, lat: c.latitude, lng: c.longitude, name: c.name,
          isFictitious: c.isFictitious, memberCount: c.memberCount,
        })) : [],
        easterEggs: easterEggs.map((e) => ({
          id: e.id, lat: e.latitude, lng: e.longitude, name: e.name,
        })),
        sos: activeSosRequests.map((s) => ({
          id: s.id, lat: s.latitude, lng: s.longitude,
          radiusKm: s.radiusKm, reason: s.reason, nickname: s.requesterNickname ?? null,
        })),
        realMe: realMeMarker ? { lat: realMeMarker.latitude, lng: realMeMarker.longitude } : null,
        fakeMe: fakeMeMarker ? { lat: fakeMeMarker.latitude, lng: fakeMeMarker.longitude } : null,
      },
    };
    const encoded = JSON.stringify(JSON.stringify(state));
    inject("window.leafletBridge && window.leafletBridge.updateState(" + encoded + ")");
  }, [
    mapReady, mapsEnabled, resolvedProvider, userLocation, isAvailable, searchRadiusKm,
    filteredUsers, workshops, eventPins, showEventPins, filterEvents,
    clubPins, filterClubs, easterEggs, activeSosRequests,
    realMeMarker, fakeMeMarker, currentUserId, inject,
  ]);

  useEffect(() => {
    buildAndPushState();
  }, [buildAndPushState]);

  useEffect(() => {
    if (!mapReady || initialCenterDoneRef.current) return;
    if (initialCenterOverride) {
      initialCenterDoneRef.current = true;
      inject(
        "window.leafletBridge && window.leafletBridge.focusOn(" +
        initialCenterOverride.latitude + "," +
        initialCenterOverride.longitude + ",14)"
      );
    } else if (userLocation) {
      initialCenterDoneRef.current = true;
      gpsCenterDoneRef.current = true;
      inject(
        "window.leafletBridge && window.leafletBridge.focusOn(" +
        userLocation.latitude + "," +
        userLocation.longitude + ",13)"
      );
    }
  }, [mapReady, userLocation, initialCenterOverride, inject]);

  useEffect(() => {
    if (!gpsFollowupEnabled) return;
    if (!mapReady || !initialCenterDoneRef.current || gpsCenterDoneRef.current || !userLocation) return;
    gpsCenterDoneRef.current = true;
    inject(
      "window.leafletBridge && window.leafletBridge.focusOn(" +
      userLocation.latitude + "," +
      userLocation.longitude + ",13)"
    );
  }, [gpsFollowupEnabled, mapReady, userLocation, inject]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string; lat?: number; lng?: number; markerType?: string; id?: string; omsReady?: boolean; nearbyDistance?: number; error?: string };
      if (msg.type === "omsStatus") {
        console.log("[InteractiveMap] omsStatus", { omsReady: msg.omsReady, nearbyDistance: msg.nearbyDistance, error: msg.error });
        return;
      }
      if (msg.type === "mapReady") {
        sendStartupBeacon("mapview_ready");
        onReady?.();
        setMapReady(true);
      } else if (msg.type === "regionChange" && msg.lat != null && msg.lng != null) {
        onRegionChangeComplete?.({ latitude: msg.lat, longitude: msg.lng });
      } else if (msg.type === "markerPress") {
        if (msg.markerType === "user") {
          const u = users.find((x) => x.id === msg.id);
          if (u) onUserPress?.(u);
        } else if (msg.markerType === "club") {
          const c = clubPins.find((x) => x.id === msg.id);
          if (c) onClubPress?.(c);
        } else if (msg.markerType === "event") {
          if (msg.id) onEventPress?.(msg.id);
        } else if (msg.markerType === "egg") {
          const e = easterEggs.find((x) => x.id === msg.id);
          if (e) onEasterEggPress?.(e);
        }
      }
    } catch {}
  }, [users, clubPins, easterEggs, onUserPress, onClubPress, onEventPress, onEasterEggPress, onReady, onRegionChangeComplete]);

  useImperativeHandle(ref, () => ({
    focusOnCoordinate: (coords: { latitude: number; longitude: number }) => {
      inject(
        "window.leafletBridge && window.leafletBridge.focusOn(" +
        coords.latitude + "," + coords.longitude + ",15)"
      );
    },
  }), [inject]);

  const centerOnUser = useCallback(() => {
    if (userLocation) {
      inject(
        "window.leafletBridge && window.leafletBridge.centerOnUser(" +
        userLocation.latitude + "," + userLocation.longitude + ")"
      );
    }
  }, [userLocation, inject]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: LEAFLET_MAP_HTML, baseUrl: "" }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["https://*", "http://*", "about:*"]}
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        cacheEnabled={true}
        startInLoadingState={false}
      />

      {locationLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      )}

      <View style={[styles.filterBar, filterBarTopOffset != null && { top: filterBarTopOffset }]}>
        <TouchableOpacity
          style={[styles.filterChip, filterBiker && { backgroundColor: Colors.maleIcon }]}
          onPress={onToggleFilterBiker}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="motorbike" size={16} color={filterBiker ? "#fff" : Colors.maleIcon} />
          <Text style={[styles.filterText, filterBiker && styles.filterTextActive]}>Biker</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filterZavorrina && { backgroundColor: Colors.femaleIcon }]}
          onPress={onToggleFilterZavorrina}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="seat-passenger" size={16} color={filterZavorrina ? "#fff" : Colors.femaleIcon} />
          <Text style={[styles.filterText, filterZavorrina && styles.filterTextActive]}>Zavorrina</Text>
        </TouchableOpacity>

        {onToggleFilterClubs != null && (
          <TouchableOpacity
            style={[styles.filterChip, filterClubs && { backgroundColor: "#009688" }]}
            onPress={onToggleFilterClubs}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="shield-check" size={16} color={filterClubs ? "#fff" : "#009688"} />
            <Text style={[styles.filterText, filterClubs && styles.filterTextActive]}>Motoclub</Text>
          </TouchableOpacity>
        )}

        {showEventPins && onToggleFilterEvents != null && (
          <TouchableOpacity
            style={[styles.filterChip, filterEvents && { backgroundColor: "#F57C00" }]}
            onPress={onToggleFilterEvents}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="calendar-star" size={16} color={filterEvents ? "#fff" : "#F57C00"} />
            <Text style={[styles.filterText, filterEvents && styles.filterTextActive]}>Eventi</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.locationButton} onPress={centerOnUser} activeOpacity={0.7}>
          <MaterialCommunityIcons name="crosshairs-gps" size={22} color={Colors.accent} />
        </TouchableOpacity>

        {showDayNightButton && (
          <TouchableOpacity
            style={styles.locationButton}
            onPress={handleToggleDayNight}
            activeOpacity={0.7}
            disabled={saveMapStyleMutation.isPending}
          >
            <MaterialCommunityIcons
              name={resolvedProvider === "carto_light" ? "weather-night" : "weather-sunny"}
              size={22}
              color={Colors.accent}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.availabilityContainer}>
        <View style={styles.availabilityIndicator}>
          <View style={styles.indicatorRow}>
            <View style={[styles.statusDot, { backgroundColor: isAvailable ? Colors.success : Colors.accentRed }]} />
            <Text style={[styles.availabilityText, { color: isAvailable ? Colors.success : Colors.accentRed }]}>
              {isAvailable ? t("map.available") : t("map.unavailable")}
            </Text>
          </View>
          <View style={styles.indicatorRow}>
            <View style={[styles.statusDot, { backgroundColor: ghostMode ? "#888888" : Colors.success }]} />
            <Text style={[styles.availabilityText, { color: ghostMode ? "#888888" : Colors.success }]}>
              {ghostMode ? t("map.offline") : t("map.online")}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
});

export default InteractiveMap;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a1a",
  },
  loadingOverlay: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 8,
  },
  filterBar: {
    position: "absolute",
    top: 16,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  filterTextActive: {
    color: "#fff",
  },
  controlsContainer: {
    position: "absolute",
    bottom: 97,
    right: 12,
    gap: 10,
    alignItems: "flex-end",
  },
  availabilityContainer: {
    position: "absolute",
    bottom: 98,
    left: 12,
    zIndex: 10,
  },
  locationButton: {
    backgroundColor: Colors.surface,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  availabilityIndicator: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  indicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  availabilityText: {
    fontSize: 12,
    fontWeight: "600" as const,
  },
});
