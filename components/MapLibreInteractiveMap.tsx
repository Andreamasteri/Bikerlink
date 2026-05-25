import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { View, StyleSheet, TouchableOpacity, Text } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import { buildMapLibreInteractiveMapHtml } from "@/lib/maplibre/map-builder";
import { MapFilterBar } from "@/components/map/MapFilterBar";
import { MapControls } from "@/components/map/MapControls";
import { HazardReportSheet } from "@/components/map/HazardReportSheet";
import { useLocationWatch } from "@/hooks/useLocationWatch";
import type {
  MapUser,
  MapWorkshop,
  MapEasterEgg,
  MapSosRequest,
  ClubMapPin,
  EventMapPin,
  InteractiveMapProps,
  InteractiveMapHandle,
} from "@/components/map/map-types";

const MAPLIBRE_INTERACTIVE_HTML = buildMapLibreInteractiveMapHtml();

export interface MapLibreInteractiveMapProps extends InteractiveMapProps {
  /**
   * Called when MapLibre fails to initialise at runtime (tile provider
   * unreachable, WebGL unavailable, CDN offline, etc.).
   * RendererInteractiveMap listens to this to transparently fall back to Leaflet.
   */
  onFallbackNeeded?: () => void;
}

const MapLibreInteractiveMap = forwardRef<InteractiveMapHandle, MapLibreInteractiveMapProps>(
  function MapLibreInteractiveMap(
    {
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
      onProposeClubLocation: _onProposeClubLocation,
      initialCenterOverride,
      onRegionChangeComplete,
      gpsFollowupEnabled = false,
      showHazardReportButton = false,
      onFallbackNeeded,
    }: MapLibreInteractiveMapProps,
    ref
  ) {
    const webViewRef = useRef<WebView>(null);
    const [mapReady, setMapReady] = useState(false);
    const [showHazardReport, setShowHazardReport] = useState(false);
    const pendingOpsRef = useRef<Array<() => void>>([]);
    const initialCenterDoneRef = useRef(false);
    const gpsCenterDoneRef = useRef(false);

    const { userLocation } = useLocationWatch();
    const mapBaseUrl = getApiUrl();

    const today = new Date().toISOString().substring(0, 10);
    const { data: eventPinsRaw } = useQuery<EventMapPin[]>({
      queryKey: ["/api/events/map"],
      enabled: showEventPins,
      select: (d) =>
        !d
          ? []
          : (d as EventMapPin[]).filter(
              (e) =>
                e.latitude != null &&
                e.longitude != null &&
                (e.eventDate ?? "").substring(0, 10) >= today
            ),
    });
    const eventPins = useMemo(() => eventPinsRaw ?? [], [eventPinsRaw]);

    const inject = useCallback((js: string) => {
      webViewRef.current?.injectJavaScript(js + ";true;");
    }, []);

    const pushState = useCallback(
      (partial: object) => {
        const encoded = JSON.stringify(JSON.stringify(partial));
        inject("window.maplibreBridge && window.maplibreBridge.updateState(" + encoded + ")");
      },
      [inject]
    );

    useEffect(() => {
      if (!mapReady) return;
      const filteredUsers = users.filter((u: MapUser) => {
        if (currentUserId != null && u.id === currentUserId) return true;
        if (u.userType === "biker" && !filterBiker) return false;
        if (u.userType === "zavorrina" && !filterZavorrina) return false;
        return true;
      });
      pushState({
        users: filteredUsers,
        workshops,
        sos: activeSosRequests,
        events:
          showEventPins && filterEvents
            ? eventPins.map((ep) => ({
                id: ep.id,
                latitude: ep.latitude,
                longitude: ep.longitude,
                title: ep.title,
              }))
            : [],
        clubs: filterClubs ? clubPins : [],
        easterEggs,
        filterBiker,
        filterZavorrina,
        filterClubs,
        filterEvents,
        meReal: realMeMarker ?? null,
        meFake: fakeMeMarker ?? null,
        radiusKm: searchRadiusKm ?? null,
        currentUserId: currentUserId ?? null,
      });
    }, [
      mapReady,
      users,
      workshops,
      activeSosRequests,
      showEventPins,
      eventPins,
      clubPins,
      easterEggs,
      filterBiker,
      filterZavorrina,
      filterClubs,
      filterEvents,
      realMeMarker,
      fakeMeMarker,
      searchRadiusKm,
      currentUserId,
      pushState,
    ]);

    useEffect(() => {
      if (!mapReady || initialCenterDoneRef.current) return;
      if (initialCenterOverride) {
        initialCenterDoneRef.current = true;
        inject(
          "window.maplibreBridge && window.maplibreBridge.focusOn(" +
            initialCenterOverride.latitude + "," +
            initialCenterOverride.longitude + ",14)"
        );
      } else if (userLocation) {
        initialCenterDoneRef.current = true;
        gpsCenterDoneRef.current = true;
        inject(
          "window.maplibreBridge && window.maplibreBridge.focusOn(" +
            userLocation.latitude + "," +
            userLocation.longitude + ",13)"
        );
      }
    }, [mapReady, initialCenterOverride, userLocation, inject]);

    useEffect(() => {
      if (!gpsFollowupEnabled || !mapReady || !initialCenterDoneRef.current || gpsCenterDoneRef.current || !userLocation) return;
      gpsCenterDoneRef.current = true;
      inject(
        "window.maplibreBridge && window.maplibreBridge.focusOn(" +
          userLocation.latitude + "," +
          userLocation.longitude + ",13)"
      );
    }, [gpsFollowupEnabled, mapReady, userLocation, inject]);

    useImperativeHandle(ref, () => ({
      focusOnCoordinate: (coords: { latitude: number; longitude: number; userId?: string }) => {
        inject(
          "window.maplibreBridge && window.maplibreBridge.focusOn(" +
            coords.latitude + "," + coords.longitude + ",15)"
        );
        if (coords.userId) {
          inject(
            "setTimeout(function(){ window.maplibreBridge && window.maplibreBridge.highlightUser(" +
              JSON.stringify(coords.userId) + "); }, 600);"
          );
        }
      },
    }), [inject]);

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        try {
          const msg = JSON.parse(event.nativeEvent.data) as {
            type: string;
            userId?: string;
            workshopId?: string;
            sosId?: string;
            eventId?: string;
            clubId?: string;
            eggId?: string;
            name?: string;
            latitude?: number;
            longitude?: number;
          };
          if (msg.type === "mapReady") {
            setMapReady(true);
            pendingOpsRef.current.forEach((fn) => fn());
            pendingOpsRef.current = [];
            onReady?.();
          } else if (msg.type === "userPress" && msg.userId) {
            const user = users.find((u: MapUser) => String(u.id) === String(msg.userId));
            if (user) onUserPress?.(user);
          } else if (msg.type === "workshopPress" && msg.workshopId) {
            // workshops press — no-op at this scope (caller can add onWorkshopPress via InteractiveMapProps extension)
          } else if (msg.type === "sosPress") {
            // SOS press acknowledged — no public callback in InteractiveMapProps v1
          } else if (msg.type === "eventPress" && msg.eventId) {
            onEventPress?.(msg.eventId);
          } else if (msg.type === "clubPress" && msg.clubId) {
            const club = clubPins.find((c: ClubMapPin) => String(c.id) === String(msg.clubId));
            if (club) onClubPress?.(club);
          } else if (msg.type === "easterEggPress" && msg.eggId) {
            const egg = easterEggs.find((e: MapEasterEgg) => String(e.id) === String(msg.eggId));
            if (egg) onEasterEggPress?.(egg);
          } else if (msg.type === "regionChange" && msg.latitude != null && msg.longitude != null) {
            onRegionChangeComplete?.({ latitude: msg.latitude, longitude: msg.longitude });
          } else if (msg.type === "maplibreLoadError") {
            console.warn("[MapLibreInteractiveMap] Runtime init failed — falling back to Leaflet");
            onFallbackNeeded?.();
          }
        } catch {
          // ignore malformed messages
        }
      },
      [users, clubPins, easterEggs, onUserPress, onReady, onEventPress, onClubPress, onEasterEggPress, onRegionChangeComplete, onFallbackNeeded]
    );

    const handleWebViewError = useCallback(() => {
      console.warn("[MapLibreInteractiveMap] WebView crashed — falling back to Leaflet");
      onFallbackNeeded?.();
    }, [onFallbackNeeded]);

    const handleCenterOnUser = useCallback(() => {
      if (userLocation) {
        inject(
          "window.maplibreBridge && window.maplibreBridge.centerOnUser(" +
            userLocation.latitude + "," + userLocation.longitude + ")"
        );
      }
    }, [inject, userLocation]);

    return (
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ html: MAPLIBRE_INTERACTIVE_HTML, baseUrl: mapBaseUrl }}
          style={styles.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={["*"]}
          onMessage={handleMessage}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          cacheEnabled={false}
          startInLoadingState={false}
          mixedContentMode="always"
          onError={handleWebViewError}
        />
        <MapFilterBar
          filterBiker={filterBiker}
          filterZavorrina={filterZavorrina}
          filterClubs={filterClubs}
          filterEvents={filterEvents}
          showEventPins={showEventPins}
          topOffset={filterBarTopOffset}
          onToggleFilterBiker={onToggleFilterBiker}
          onToggleFilterZavorrina={onToggleFilterZavorrina}
          onToggleFilterClubs={onToggleFilterClubs}
          onToggleFilterEvents={onToggleFilterEvents}
        />
        <MapControls
          isAvailable={isAvailable ?? false}
          ghostMode={ghostMode}
          resolvedProvider="carto_dark"
          showDayNightButton={false}
          isDayNightPending={false}
          onCenterOnUser={handleCenterOnUser}
          onToggleDayNight={() => {}}
        />
        {showHazardReportButton && (
          <TouchableOpacity
            style={styles.hazardFab}
            onPress={() => setShowHazardReport(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.hazardFabIcon}>{"\u26A0\uFE0F"}</Text>
          </TouchableOpacity>
        )}
        <HazardReportSheet
          visible={showHazardReport}
          onClose={() => setShowHazardReport(false)}
          userLocation={userLocation}
        />
      </View>
    );
  }
);

export default MapLibreInteractiveMap;

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFill, backgroundColor: "#1a1a1a" },
  hazardFab: {
    position: "absolute",
    bottom: 155,
    right: 12,
    backgroundColor: "#1e1e1e",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  hazardFabIcon: {
    fontSize: 20,
  },
});

export type { MapUser, MapWorkshop, MapEasterEgg, MapSosRequest, ClubMapPin, InteractiveMapHandle };
