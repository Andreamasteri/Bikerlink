import React, { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { buildOLInteractiveHtml } from "@/lib/openlayers/map-builder";
import { parseMessage } from "@/lib/openlayers/bridge-events";
import { MapFilterBar } from "@/components/map/MapFilterBar";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import Colors from "@/constants/colors";
import type { InteractiveMapProps, InteractiveMapHandle } from "@/components/map/map-types";

const OpenLayersInteractiveMap = forwardRef<InteractiveMapHandle, InteractiveMapProps>(
  function OpenLayersInteractiveMap(
    {
      users = [], easterEggs = [], activeSosRequests: _a = [], workshops: _w = [],
      isAvailable: _av, ghostMode: _g = false, searchRadiusKm,
      filterBiker, filterZavorrina, filterBarTopOffset,
      onToggleFilterBiker, onToggleFilterZavorrina,
      onUserPress, onEasterEggPress, onReady, currentUserId,
      realMeMarker, fakeMeMarker: _f,
      filterClubs = true, onToggleFilterClubs,
      filterEvents = true, onToggleFilterEvents,
      onRegionChangeComplete, initialCenterOverride, onFatalError,
    }: InteractiveMapProps,
    ref
  ) {
    const webViewRef = useRef<WebView>(null);
    const [mapReady, setMapReady] = useState(false);
    const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
    const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");
    const initialCenterRef = useRef(
      initialCenterOverride ? { lat: initialCenterOverride.latitude, lng: initialCenterOverride.longitude } : null
    );
    const onFatalErrorRef = useRef(onFatalError);
    onFatalErrorRef.current = onFatalError;

    const mapHtml = React.useMemo(
      () => buildOLInteractiveHtml(tileConfig.urlTemplate, initialCenterRef.current),
      [tileConfig.urlTemplate]
    );

    const inject = useCallback((js: string) => {
      webViewRef.current?.injectJavaScript(js + ";true;");
    }, []);

    const pushState = useCallback(() => {
      if (!mapReady) return;
      const filteredUsers = users.filter((u) => {
        if (currentUserId != null && u.id === currentUserId) return true;
        if (u.userType === "biker" && !filterBiker) return false;
        if (u.userType === "zavorrina" && !filterZavorrina) return false;
        return true;
      });
      const state = {
        markers: {
          users: filteredUsers.map((u) => ({ id: u.id, lat: u.latitude, lng: u.longitude, userType: u.userType })),
          easterEggs: easterEggs.map((e) => ({ id: e.id, lat: e.latitude, lng: e.longitude })),
        },
        userLocation: realMeMarker ? { lat: realMeMarker.latitude, lng: realMeMarker.longitude } : undefined,
        searchRadius: (searchRadiusKm && realMeMarker) ? { lat: realMeMarker.latitude, lng: realMeMarker.longitude, km: searchRadiusKm } : undefined,
      };
      const encoded = JSON.stringify(JSON.stringify(state));
      inject(`window.olBridge && window.olBridge.updateState(${encoded})`);
    }, [mapReady, users, easterEggs, filterBiker, filterZavorrina, currentUserId, realMeMarker, searchRadiusKm, inject]);

    useEffect(() => { pushState(); }, [pushState]);

    const handleMessage = useCallback((event: WebViewMessageEvent) => {
      const msg = parseMessage(event.nativeEvent.data);
      if (!msg) return;
      if (msg.type === "ready") { setMapReady(true); onReady?.(); }
      else if (msg.type === "userPress" && msg.userId) { const u = users.find((x) => x.id === msg.userId); if (u) onUserPress?.(u); }
      else if (msg.type === "easterEggPress" && msg.eggId) { const e = easterEggs.find((x) => x.id === msg.eggId); if (e) onEasterEggPress?.(e); }
      else if (msg.type === "regionChange" && msg.lat != null && msg.lng != null) { onRegionChangeComplete?.({ latitude: msg.lat, longitude: msg.lng }); }
      else if (msg.type === "error") { onFatalErrorRef.current?.(); }
    }, [users, easterEggs, onReady, onUserPress, onEasterEggPress, onRegionChangeComplete]);

    useImperativeHandle(ref, () => ({
      focusOnCoordinate: (coords: { latitude: number; longitude: number }) => {
        inject(`window.olBridge && window.olBridge.focusOn(${JSON.stringify({ lat: coords.latitude, lng: coords.longitude, zoom: 15 })})`);
      },
    }), [inject]);

    const handleCenterOnUser = useCallback(() => {
      if (!realMeMarker) return;
      inject(`window.olBridge && window.olBridge.centerOnUser(${JSON.stringify({ lat: realMeMarker.latitude, lng: realMeMarker.longitude })})`);
    }, [realMeMarker, inject]);

    return (
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ html: mapHtml, baseUrl: getApiUrl() }}
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
          onError={useCallback(() => { onFatalErrorRef.current?.(); }, [])}
        />
        {!mapReady && <View style={styles.loadingOverlay}><ActivityIndicator size="small" color={Colors.accent} /></View>}
        {realMeMarker && mapReady && (
          <Pressable style={styles.centerBtn} onPress={handleCenterOnUser}>
            <Ionicons name="locate" size={20} color={Colors.text} />
          </Pressable>
        )}
        <MapFilterBar
          filterBiker={filterBiker} filterZavorrina={filterZavorrina}
          filterClubs={filterClubs} filterEvents={filterEvents}
          showEventPins={false} topOffset={filterBarTopOffset}
          onToggleFilterBiker={onToggleFilterBiker} onToggleFilterZavorrina={onToggleFilterZavorrina}
          onToggleFilterClubs={onToggleFilterClubs} onToggleFilterEvents={onToggleFilterEvents}
        />
      </View>
    );
  }
);

export default OpenLayersInteractiveMap;

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFill, backgroundColor: "#1a1a1a" },
  loadingOverlay: { position: "absolute", top: 16, right: 16, backgroundColor: Colors.surface, borderRadius: 20, padding: 8 },
  centerBtn: { position: "absolute", bottom: 80, right: 16, backgroundColor: Colors.surface, borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 4 },
});
