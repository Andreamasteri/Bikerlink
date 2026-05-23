import React, { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import Colors from "@/constants/colors";
import { useMapConfig } from "@/lib/map-context";
import type { MapProvider } from "@/lib/map-tiles";
import { apiRequest, queryClient } from "@/lib/query-client";
import { LEAFLET_MAP_HTML } from "@/lib/leaflet-map-html";
import { useLocationWatch } from "@/hooks/useLocationWatch";
import { MapFilterBar } from "@/components/map/MapFilterBar";
import { MapControls } from "@/components/map/MapControls";
import { useMapStateSync } from "@/hooks/useMapStateSync";
import { createMapMessageHandler } from "@/components/map/createMapMessageHandler";
import type {
  MapUser, MapWorkshop, MapEasterEgg, MapSosRequest,
  ClubMapPin, EventMapPin, InteractiveMapProps, InteractiveMapHandle,
} from "@/components/map/map-types";

export type { MapUser, MapWorkshop, MapEasterEgg, MapSosRequest, ClubMapPin, InteractiveMapHandle };

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
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const initialCenterDoneRef = useRef(false);
  const gpsCenterDoneRef = useRef(false);
  const { userLocation, locationLoading } = useLocationWatch();
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
    mapReady, inject, mapsEnabled, resolvedProvider, userLocation, isAvailable,
    searchRadiusKm, filteredUsers, workshops, eventPins, showEventPins, filterEvents,
    clubPins, filterClubs, easterEggs, activeSosRequests, realMeMarker, fakeMeMarker,
    currentUserId,
  });

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
});
