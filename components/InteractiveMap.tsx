import React, { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { useQuery } from "@tanstack/react-query";
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Text } from "react-native";
import WebView from "react-native-webview";
import Colors from "@/constants/colors";
import { useMapConfig } from "@/lib/map-context";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { LEAFLET_MAP_HTML } from "@/lib/leaflet-map-html";
import { useLocationWatch } from "@/hooks/useLocationWatch";
import { MapFilterBar } from "@/components/map/MapFilterBar";
import { MapControls } from "@/components/map/MapControls";
import { MapZoomSlider } from "@/components/map/MapZoomSlider";
import { MapStyleToggle } from "@/components/MapStyleToggle";
import { useMapStyle } from "@/hooks/useMapStyle";
import { MAP_STYLE_PRESETS } from "@/lib/maplibre/style-presets";
import { useMapStateSync } from "@/hooks/useMapStateSync";
import { createMapMessageHandler } from "@/components/map/createMapMessageHandler";
import { HazardDetailSheet } from "@/components/map/HazardDetailSheet";
import { HazardReportSheet } from "@/components/map/HazardReportSheet";
import { VesselDetailSheet } from "@/components/map/VesselDetailSheet";
import { useMapTelemetry } from "@/hooks/useMapTelemetry";
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
  motoTags, onChangeMotoTags,
  onClubPress, initialCenterOverride,
  onRegionChangeComplete, gpsFollowupEnabled = false,
  showHazardReportButton = false,
  fixedPositionEnabled = false,
  onFixedPositionBadgePress,
  filterVessels = false,
  onToggleFilterVessels,
  aisEnabled = false,
}: InteractiveMapProps, ref) {
  const { enabled: mapsEnabled } = useMapConfig();
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapReadyEpoch, setMapReadyEpoch] = useState(0);
  const [viewState, setViewState] = useState({
    zoom: 6,
    minZoom: 0,
    maxZoom: 19,
    lat: 41.9028,
    lng: 12.4964,
  });
  const initialCenterDoneRef = useRef(false);
  const gpsCenterDoneRef = useRef(false);
  const { userLocation, locationLoading } = useLocationWatch();
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [showHazardReport, setShowHazardReport] = useState(false);
  const [selectedVesselMmsi, setSelectedVesselMmsi] = useState<string | null>(null);
  const { styleId, setStyle } = useMapStyle();
  const activePreset = MAP_STYLE_PRESETS[styleId];
  const effectiveTileUrl = activePreset.tileUrl;
  const effectiveTileMaxZoom = activePreset.maxZoom;
  useEffect(() => { sendStartupBeacon("interactive_map_mount"); }, []);

  // Task #2686 — Maps watchdog telemetry
  const tlm = useMapTelemetry("InteractiveMap", "leaflet");
  const mapInitStartRef = useRef<number>(Date.now());
  useEffect(() => {
    mapInitStartRef.current = Date.now();
    tlm.emit("map_init");
    return () => { tlm.emit("map_destroy"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (mapReady) {
      tlm.emit("map_ready", { durationMs: Date.now() - mapInitStartRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

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

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  type VesselData = { mmsi: number; lat: number; lng: number; cog: number; sog: number; name: string; shipType: number; updatedAt: number; trueHeading: number };
  const { data: aisVesselsRaw } = useQuery<VesselData[]>({
    queryKey: ["/api/ais/vessels", userLocation?.latitude, userLocation?.longitude],
    queryFn: async () => {
      if (!userLocation) return [];
      const url = new URL("/api/ais/vessels", getApiUrl());
      url.searchParams.set("lat", String(userLocation.latitude));
      url.searchParams.set("lng", String(userLocation.longitude));
      url.searchParams.set("radiusNm", "20");
      const res = await apiRequest("GET", url.pathname + url.search);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: mapReady && !!aisEnabled && filterVessels && !!userLocation,
    staleTime: 25000,
    refetchInterval: 30000,
    retry: false,
  });
  const aisVessels = aisVesselsRaw ?? [];
  const showNoVesselsHint = !!aisEnabled && filterVessels && !!userLocation && aisVessels.length === 0 && aisVesselsRaw !== undefined;

  useEffect(() => {
    if (!mapReady) return;
    const jsonStr = JSON.stringify(filterVessels ? aisVessels : []);
    inject("window.leafletBridge && window.leafletBridge.updateVessels(" + JSON.stringify(jsonStr) + ")");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, filterVessels, aisVessels.length]);

  const filteredUsers = users.filter((u) => {
    if (currentUserId != null && u.id === currentUserId) return true;
    if (u.userType === "biker" && !filterBiker) return false;
    if (u.userType === "zavorrina" && !filterZavorrina) return false;
    return true;
  });

  useMapStateSync({
    mapReady, mapReadyEpoch, inject, mapsEnabled,
    activeTileUrl: effectiveTileUrl,
    activeTileMaxZoom: effectiveTileMaxZoom,
    userLocation, isAvailable,
    searchRadiusKm, filteredUsers, workshops, eventPins, showEventPins, filterEvents,
    clubPins, filterClubs, easterEggs, activeSosRequests, realMeMarker, fakeMeMarker,
    currentUserId, fixedPositionEnabled,
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
      onVesselPress: (mmsi) => setSelectedVesselMmsi(mmsi),
      onReady, onRegionChangeComplete, setMapReady,
      onMapReadyEpoch: () => setMapReadyEpoch((n) => n + 1),
      onViewStateChange: (s) => setViewState(s),
      onMapInitError: (error) => {
        tlm.emit("map_init_failed", {
          errorMessage: error,
          details: { source: "leaflet_init_block" },
        });
      },
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
    invalidateSize: () => {
      inject("window.leafletBridge && window.leafletBridge.invalidateSize ? window.leafletBridge.invalidateSize() : (window._map && window._map.invalidateSize())");
    },
  }), [inject]);

  const centerOnUser = useCallback(() => {
    if (userLocation) inject("window.leafletBridge && window.leafletBridge.centerOnUser(" + userLocation.latitude + "," + userLocation.longitude + ")");
  }, [userLocation, inject]);

  const handleZoomChange = useCallback((z: number) => {
    setViewState((prev) => ({ ...prev, zoom: z }));
    inject("window.leafletBridge && window.leafletBridge.setZoom(" + z + ")");
  }, [inject]);

  const mapHtml = LEAFLET_MAP_HTML;
  const mapBaseUrl = getApiUrl();
  /* Memoize WebView source: react-native-webview shallow-compares the source
     prop. A new object literal each render can trigger an unintended reload
     of the WebView, which resets the embedded OverlappingMarkerSpiderfier
     (vista ragno) and leaves the map empty until the next state push.
     Keeping the object identity stable prevents the regression on Task #2484. */
  const webViewSource = useMemo(
    () => ({ html: mapHtml, baseUrl: mapBaseUrl }),
    [mapHtml, mapBaseUrl],
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={webViewSource}
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
      {filterBarTopOffset != null && (
        <MapFilterBar
          filterBiker={filterBiker} filterZavorrina={filterZavorrina}
          filterClubs={filterClubs} filterEvents={filterEvents}
          showEventPins={showEventPins} topOffset={filterBarTopOffset}
          onToggleFilterBiker={onToggleFilterBiker} onToggleFilterZavorrina={onToggleFilterZavorrina}
          onToggleFilterClubs={onToggleFilterClubs} onToggleFilterEvents={onToggleFilterEvents}
          motoTags={motoTags} onChangeMotoTags={onChangeMotoTags}
          filterVessels={filterVessels} onToggleFilterVessels={onToggleFilterVessels}
          aisEnabled={aisEnabled}
        />
      )}
      {selectedVesselMmsi == null && (
        <MapControls
          isAvailable={isAvailable} ghostMode={ghostMode}
          onCenterOnUser={centerOnUser}
          availabilityBottomOffset={filterBarTopOffset != null ? 110 : undefined}
          locationButtonBottomOffset={filterBarTopOffset != null ? 205 : undefined}
          compact={filterBarTopOffset == null}
          hideAvailability={filterBarTopOffset == null}
        />
      )}
      {mapReady && selectedVesselMmsi == null && (
        <MapStyleToggle
          currentStyleId={styleId}
          onSelectStyle={setStyle}
          bottomOffset={filterBarTopOffset != null ? 188 : undefined}
          leftOffset={filterBarTopOffset != null ? 15 : undefined}
          compact={filterBarTopOffset == null}
        />
      )}
      {mapReady && filterBarTopOffset != null && selectedVesselMmsi == null && (
        <MapZoomSlider
          zoom={viewState.zoom}
          minZoom={viewState.minZoom}
          maxZoom={viewState.maxZoom}
          latitude={viewState.lat}
          topOffset={filterBarTopOffset + 96}
          bottomOffset={313}
          leftOffset={15}
          onZoomChange={handleZoomChange}
        />
      )}
      {showHazardReportButton && hazardsEnabled && (
        <TouchableOpacity
          style={styles.hazardFab}
          onPress={() => setShowHazardReport(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.hazardFabIcon}>⚠️</Text>
        </TouchableOpacity>
      )}
      {fixedPositionEnabled && (
        <TouchableOpacity
          style={styles.fixedPositionBadge}
          onPress={onFixedPositionBadgePress}
          activeOpacity={onFixedPositionBadgePress ? 0.7 : 1}
          disabled={!onFixedPositionBadgePress}
        >
          <Text style={styles.fixedPositionText}>🔒 Posizione fissa attiva</Text>
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
      <VesselDetailSheet
        vessel={selectedVesselMmsi != null
          ? (aisVessels.find((v) => String(v.mmsi) === selectedVesselMmsi) ?? null)
          : null}
        onClose={() => setSelectedVesselMmsi(null)}
      />
      {showNoVesselsHint && (
        <View style={styles.noVesselsBanner} pointerEvents="none">
          <Text style={styles.noVesselsText}>⚓ Nessuna nave nelle vicinanze (20 nm)</Text>
        </View>
      )}
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
    bottom: 145,
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
  fixedPositionBadge: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fixedPositionText: {
    backgroundColor: "rgba(255,111,0,0.92)",
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    overflow: "hidden",
    letterSpacing: 0.2,
  },
  noVesselsBanner: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  noVesselsText: {
    backgroundColor: "rgba(2,132,199,0.88)",
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    overflow: "hidden",
  },
});
