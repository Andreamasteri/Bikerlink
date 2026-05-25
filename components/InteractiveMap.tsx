import React, { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Text } from "react-native";
import WebView from "react-native-webview";
import Colors from "@/constants/colors";
import { useMapConfig } from "@/lib/map-context";
import type { MapProvider } from "@/lib/map-tiles";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { LEAFLET_MAP_HTML } from "@/lib/leaflet-map-html";
import { useLocationWatch } from "@/hooks/useLocationWatch";
import { MapFilterBar } from "@/components/map/MapFilterBar";
import { MapControls } from "@/components/map/MapControls";
import { useMapStateSync } from "@/hooks/useMapStateSync";
import { createMapMessageHandler } from "@/components/map/createMapMessageHandler";
import { HazardDetailSheet } from "@/components/map/HazardDetailSheet";
import { HazardReportSheet } from "@/components/map/HazardReportSheet";
import { HAZARD_ICONS } from "@shared/db/road-hazards";
import type {
  MapUser, MapWorkshop, MapEasterEgg, MapSosRequest,
  ClubMapPin, EventMapPin, InteractiveMapProps, InteractiveMapHandle,
} from "@/components/map/map-types";

export type { MapUser, MapWorkshop, MapEasterEgg, MapSosRequest, ClubMapPin, InteractiveMapHandle };

interface HazardItem {
  id: string;
  type: string;
  lat: number;
  lng: number;
  icon: string;
}

const InteractiveMap = forwardRef<InteractiveMapHandle, InteractiveMapProps>(function InteractiveMap({
  users = [], workshops = [], easterEggs = [], activeSosRequests = [],
  isAvailable, ghostMode = false, searchRadiusKm,
  filterBiker, filterZavorrina, filterBarTopOffset,
  onToggleFilterBiker, onToggleFilterZavorrina,
  onUserPress, onEasterEggPress, onReady, currentUserId,
  realMeMarker, fakeMeMarker, onEventPress,
  showEventPins = true, clubPins = [],
  filterClubs = true, onToggleFilterClubs,
  filterEvents = true, onToggleFilterEvents,
  onClubPress, initialCenterOverride,
  onRegionChangeComplete, gpsFollowupEnabled = false,
  showHazardReportButton = false,
}: InteractiveMapProps, ref) {
  const { enabled: mapsEnabled, resolvedProvider, activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const initialCenterDoneRef = useRef(false);
  const gpsCenterDoneRef = useRef(false);
  const { userLocation, locationLoading } = useLocationWatch();
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [showHazardReport, setShowHazardReport] = useState(false);
  useEffect(() => { sendStartupBeacon("interactive_map_mount"); }, []);

  const today = new Date().toISOString().substring(0, 10);
  const { data: eventPinsRaw } = useQuery<EventMapPin[]>({
    queryKey: ["/api/events/map"],
    enabled: showEventPins,
    select: (d) => (!d ? [] : (d as EventMapPin[]).filter(
      (e) => e.latitude != null && e.longitude != null && (e.eventDate ?? "").substring(0, 10) >= today
    )),
  });
  const eventPins = eventPinsRaw ?? [];

  const { data: hazardsEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/road-hazards-enabled"],
    staleTime: 60000,
    enabled: mapReady,
  });
  const hazardsEnabled = hazardsEnabledData?.enabled !== false;

  const { data: hazardsRaw } = useQuery<{ hazards: HazardItem[] }>({
    queryKey: ["/api/road-hazards", userLocation?.latitude, userLocation?.longitude],
    queryFn: async () => {
      if (!userLocation) return { hazards: [] };
      const url = new URL("/api/road-hazards", getApiUrl());
      url.searchParams.set("lat", String(userLocation.latitude));
      url.searchParams.set("lng", String(userLocation.longitude));
      url.searchParams.set("radius", "50");
      const res = await apiRequest("GET", url.pathname + url.search);
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: mapReady && hazardsEnabled && !!userLocation,
    staleTime: 60000,
    refetchInterval: 5 * 60 * 1000,
  });
  const hazards: HazardItem[] = (hazardsRaw?.hazards ?? []).map((h) => ({
    id: h.id,
    type: h.type,
    lat: h.lat,
    lng: h.lng,
    icon: HAZARD_ICONS[h.type as keyof typeof HAZARD_ICONS] ?? "⚠️",
  }));

  const saveMapStyleMutation = useMutation({
    mutationFn: async (style: MapProvider) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", { preferredMapStyle: style });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/users/me"] }); },
  });

  const handleToggleDayNight = useCallback(() => {
    const next: MapProvider = resolvedProvider === "carto_light" ? "carto_dark" : "carto_light";
    saveMapStyleMutation.mutate(next);
  }, [resolvedProvider, saveMapStyleMutation]);

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  const filteredUsers = users.filter((u) => {
    if (currentUserId != null && u.id === currentUserId) return true;
    if (u.userType === "biker" && !filterBiker) return false;
    if (u.userType === "zavorrina" && !filterZavorrina) return false;
    return true;
  });

  useMapStateSync({
    mapReady, inject, mapsEnabled, activeTileUrl, activeTileMaxZoom, userLocation, isAvailable,
    searchRadiusKm, filteredUsers, workshops, eventPins, showEventPins, filterEvents,
    clubPins, filterClubs, easterEggs, activeSosRequests, realMeMarker, fakeMeMarker,
    currentUserId,
  });

  useEffect(() => {
    if (!mapReady) return;
    const jsonStr = JSON.stringify(hazardsEnabled ? hazards : []);
    inject("window.leafletBridge && window.leafletBridge.updateHazards(" + JSON.stringify(jsonStr) + ")");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, hazards.length, hazardsEnabled]);

  useEffect(() => {
    if (!mapReady || initialCenterDoneRef.current) return;
    if (initialCenterOverride) {
      initialCenterDoneRef.current = true;
      inject("window.leafletBridge && window.leafletBridge.focusOn(" + initialCenterOverride.latitude + "," + initialCenterOverride.longitude + ",14)");
    } else if (userLocation) {
      initialCenterDoneRef.current = true;
      gpsCenterDoneRef.current = true;
      inject("window.leafletBridge && window.leafletBridge.focusOn(" + userLocation.latitude + "," + userLocation.longitude + ",13)");
    }
  }, [mapReady, userLocation, initialCenterOverride, inject]);

  useEffect(() => {
    if (!gpsFollowupEnabled || !mapReady || !initialCenterDoneRef.current || gpsCenterDoneRef.current || !userLocation) return;
    gpsCenterDoneRef.current = true;
    inject("window.leafletBridge && window.leafletBridge.focusOn(" + userLocation.latitude + "," + userLocation.longitude + ",13)");
  }, [gpsFollowupEnabled, mapReady, userLocation, inject]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleMessage = useCallback(
    createMapMessageHandler({
      users, clubPins, easterEggs,
      onUserPress, onClubPress, onEventPress, onEasterEggPress,
      onHazardPress: (id) => setSelectedHazardId(id),
      onReady, onRegionChangeComplete, setMapReady,
    }),
    [users, clubPins, easterEggs, onUserPress, onClubPress, onEventPress, onEasterEggPress, onReady, onRegionChangeComplete],
  );

  useImperativeHandle(ref, () => ({
    focusOnCoordinate: (coords: { latitude: number; longitude: number; userId?: string }) => {
      inject("window.leafletBridge && window.leafletBridge.focusOn(" + coords.latitude + "," + coords.longitude + ",15)");
      if (coords.userId) {
        inject("setTimeout(function(){ window.leafletBridge && window.leafletBridge.highlightUser(" + JSON.stringify(coords.userId) + "); }, 600);");
      }
    },
  }), [inject]);

  const centerOnUser = useCallback(() => {
    if (userLocation) inject("window.leafletBridge && window.leafletBridge.centerOnUser(" + userLocation.latitude + "," + userLocation.longitude + ")");
  }, [userLocation, inject]);

  const showDayNightButton = mapsEnabled && (resolvedProvider === "carto_light" || resolvedProvider === "carto_dark");

  const mapHtml = LEAFLET_MAP_HTML;
  const mapBaseUrl = getApiUrl();

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml, baseUrl: mapBaseUrl }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["https://*", "http://*", "about:*"]}
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        cacheEnabled={false}
        startInLoadingState={false}
        onError={(e) => console.warn("[InteractiveMap] WebView error:", e.nativeEvent.description)}
      />
      {locationLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      )}
      <MapFilterBar
        filterBiker={filterBiker} filterZavorrina={filterZavorrina}
        filterClubs={filterClubs} filterEvents={filterEvents}
        showEventPins={showEventPins} topOffset={filterBarTopOffset}
        onToggleFilterBiker={onToggleFilterBiker} onToggleFilterZavorrina={onToggleFilterZavorrina}
        onToggleFilterClubs={onToggleFilterClubs} onToggleFilterEvents={onToggleFilterEvents}
      />
      <MapControls
        isAvailable={isAvailable} ghostMode={ghostMode}
        resolvedProvider={resolvedProvider} showDayNightButton={showDayNightButton}
        isDayNightPending={saveMapStyleMutation.isPending}
        onCenterOnUser={centerOnUser} onToggleDayNight={handleToggleDayNight}
      />
      {showHazardReportButton && hazardsEnabled && (
        <TouchableOpacity
          style={styles.hazardFab}
          onPress={() => setShowHazardReport(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.hazardFabIcon}>⚠️</Text>
        </TouchableOpacity>
      )}
      <HazardDetailSheet
        hazardId={selectedHazardId}
        onClose={() => setSelectedHazardId(null)}
      />
      <HazardReportSheet
        visible={showHazardReport}
        onClose={() => setShowHazardReport(false)}
        userLocation={userLocation}
      />
    </View>
  );
});

export default InteractiveMap;

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFill, backgroundColor: "#1a1a1a" },
  loadingOverlay: {
    position: "absolute", top: 16, right: 16,
    backgroundColor: Colors.surface, borderRadius: 20, padding: 8,
  },
  hazardFab: {
    position: "absolute",
    bottom: 155,
    right: 12,
    backgroundColor: Colors.surface,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hazardFabIcon: {
    fontSize: 20,
  },
});
