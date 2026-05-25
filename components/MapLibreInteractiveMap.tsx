import React, { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { buildMapLibreInteractiveHtml } from "@/lib/maplibre/map-builder";
import { getMapLibreStyleExpr } from "@/lib/maplibre/tile-config";
import { parseMessage } from "@/lib/maplibre/bridge-events";
import { MapFilterBar } from "@/components/map/MapFilterBar";
import Colors from "@/constants/colors";
import type { InteractiveMapProps, InteractiveMapHandle } from "@/components/map/map-types";

const MapLibreInteractiveMap = forwardRef<InteractiveMapHandle, InteractiveMapProps>(
  function MapLibreInteractiveMap(
    {
      users = [], easterEggs = [], workshops: _workshops = [], activeSosRequests: _activeSosRequests = [],
      isAvailable: _isAvailable, ghostMode: _ghostMode = false, searchRadiusKm,
      filterBiker, filterZavorrina, filterBarTopOffset,
      onToggleFilterBiker, onToggleFilterZavorrina,
      onUserPress, onEasterEggPress, onReady, currentUserId,
      realMeMarker, fakeMeMarker: _fakeMeMarker,
      filterClubs = true, onToggleFilterClubs,
      filterEvents = true, onToggleFilterEvents,
      onRegionChangeComplete, initialCenterOverride,
      onFatalError,
    }: InteractiveMapProps,
    ref
  ) {
    const webViewRef = useRef<WebView>(null);
    const [mapReady, setMapReady] = useState(false);
    const styleExpr = getMapLibreStyleExpr();
    const initialCenterRef = useRef(
      initialCenterOverride ? { lat: initialCenterOverride.latitude, lng: initialCenterOverride.longitude } : null
    );
    const onFatalErrorRef = useRef(onFatalError);
    onFatalErrorRef.current = onFatalError;

    const mapHtml = React.useMemo(
      () => buildMapLibreInteractiveHtml(styleExpr, initialCenterRef.current),
      [styleExpr]
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
          users: filteredUsers.map((u) => ({
            id: u.id, lat: u.latitude, lng: u.longitude,
            userType: u.userType, sex: u.sex,
          })),
          easterEggs: easterEggs.map((e) => ({ id: e.id, lat: e.latitude, lng: e.longitude })),
        },
        userLocation: realMeMarker ? { lat: realMeMarker.latitude, lng: realMeMarker.longitude } : undefined,
        searchRadius: (searchRadiusKm && realMeMarker) ? { lat: realMeMarker.latitude, lng: realMeMarker.longitude, km: searchRadiusKm } : undefined,
      };
      const encoded = JSON.stringify(JSON.stringify(state));
      inject(`window.mlBridge && window.mlBridge.updateState(${encoded})`);
    }, [mapReady, users, easterEggs, filterBiker, filterZavorrina, currentUserId, realMeMarker, searchRadiusKm, inject]);

    useEffect(() => { pushState(); }, [pushState]);

    const handleMessage = useCallback((event: WebViewMessageEvent) => {
      const msg = parseMessage(event.nativeEvent.data);
      if (!msg) return;
      if (msg.type === "ready") {
        setMapReady(true);
        onReady?.();
      } else if (msg.type === "userPress" && msg.userId) {
        const user = users.find((u) => u.id === msg.userId);
        if (user) onUserPress?.(user);
      } else if (msg.type === "easterEggPress" && msg.eggId) {
        const egg = easterEggs.find((e) => e.id === msg.eggId);
        if (egg) onEasterEggPress?.(egg);
      } else if (msg.type === "regionChange" && msg.lat != null && msg.lng != null) {
        onRegionChangeComplete?.({ latitude: msg.lat, longitude: msg.lng });
      } else if (msg.type === "error") {
        onFatalErrorRef.current?.();
      }
    }, [users, easterEggs, onReady, onUserPress, onEasterEggPress, onRegionChangeComplete]);

    useImperativeHandle(ref, () => ({
      focusOnCoordinate: (coords: { latitude: number; longitude: number; userId?: string }) => {
        const payloadJson = JSON.stringify({ lat: coords.latitude, lng: coords.longitude, zoom: 15 });
        inject(`window.mlBridge && window.mlBridge.focusOn(${payloadJson})`);
      },
    }), [inject]);

    const handleCenterOnUser = useCallback(() => {
      if (!realMeMarker) return;
      const payloadJson = JSON.stringify({ lat: realMeMarker.latitude, lng: realMeMarker.longitude });
      inject(`window.mlBridge && window.mlBridge.centerOnUser(${payloadJson})`);
    }, [realMeMarker, inject]);

    const handleWebViewError = useCallback(() => {
      onFatalErrorRef.current?.();
    }, []);

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
          onError={handleWebViewError}
        />
        {!mapReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={Colors.accent} />
          </View>
        )}
        {realMeMarker && mapReady && (
          <Pressable style={styles.centerBtn} onPress={handleCenterOnUser}>
            <Ionicons name="locate" size={20} color={Colors.text} />
          </Pressable>
        )}
        <MapFilterBar
          filterBiker={filterBiker} filterZavorrina={filterZavorrina}
          filterClubs={filterClubs} filterEvents={filterEvents}
          showEventPins={false} topOffset={filterBarTopOffset}
          onToggleFilterBiker={onToggleFilterBiker}
          onToggleFilterZavorrina={onToggleFilterZavorrina}
          onToggleFilterClubs={onToggleFilterClubs}
          onToggleFilterEvents={onToggleFilterEvents}
        />
      </View>
    );
  }
);

export default MapLibreInteractiveMap;

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFill, backgroundColor: "#1a1a1a" },
  loadingOverlay: {
    position: "absolute", top: 16, right: 16,
    backgroundColor: Colors.surface, borderRadius: 20, padding: 8,
  },
  centerBtn: {
    position: "absolute",
    bottom: 80,
    right: 16,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
});
