import React, { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { buildMapLibreInteractiveHtml } from "@/lib/maplibre/map-builder";
import { getMapLibreStyleExpr, buildMapLibreStyle } from "@/lib/maplibre/tile-config";
import { parseMessage } from "@/lib/maplibre/bridge-events";
import { readTileCacheAsBase64, saveTileToCache, getMimeForUrl } from "@/lib/maps/tile-cache";
import { MapFilterBar } from "@/components/map/MapFilterBar";
import { MapControls } from "@/components/map/MapControls";
import { MapZoomSlider } from "@/components/map/MapZoomSlider";
import { MapNorthCompass } from "@/components/map/MapNorthCompass";
import { MapStyleToggle } from "@/components/MapStyleToggle";
import { useMapStyle } from "@/hooks/useMapStyle";
import { MAP_STYLE_PRESETS } from "@/lib/maplibre/style-presets";
import Colors from "@/constants/colors";
import type { InteractiveMapProps, InteractiveMapHandle } from "@/components/map/map-types";

const MapLibreInteractiveMap = forwardRef<InteractiveMapHandle, InteractiveMapProps>(
  function MapLibreInteractiveMap(
    {
      users = [], easterEggs = [], workshops: _workshops = [], activeSosRequests: _activeSosRequests = [],
      isAvailable, ghostMode = false, searchRadiusKm,
      filterBiker, filterZavorrina, filterBarTopOffset,
      onToggleFilterBiker, onToggleFilterZavorrina,
      onUserPress, onEasterEggPress, onReady, currentUserId,
      realMeMarker, fakeMeMarker: _fakeMeMarker,
      filterClubs = true, onToggleFilterClubs,
      filterEvents = true, onToggleFilterEvents,
      onRegionChangeComplete, initialCenterOverride,
      onFatalError,
      showRouteDetailPanel = false,
    }: InteractiveMapProps,
    ref
  ) {
    const webViewRef = useRef<WebView>(null);
    const [mapReady, setMapReady] = useState(false);
    const [viewState, setViewState] = useState({
      zoom: 6,
      minZoom: 0,
      maxZoom: 22,
      bearing: 0,
      lat: 45.5,
      lng: 10.5,
    });
    const { styleId, setStyle } = useMapStyle();
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

    useEffect(() => {
      if (!mapReady) return;
      const preset = MAP_STYLE_PRESETS[styleId];
      const styleObj = buildMapLibreStyle(preset.tileUrl, preset.maxZoom);
      const encoded = JSON.stringify(JSON.stringify(styleObj));
      inject(`window.mlBridge && window.mlBridge.setStyle(${encoded})`);
    }, [mapReady, styleId, inject]);

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
      const raw = msg as unknown as Record<string, unknown>;
      if (raw.type === "tileCheck" && typeof raw.reqId === "string" && typeof raw.url === "string") {
        const url = raw.url;
        const reqId = raw.reqId;
        readTileCacheAsBase64(url).then((b64) => {
          const wv = webViewRef.current;
          if (!wv) return;
          if (b64) {
            const mime = getMimeForUrl(url);
            const dataUri = `data:${mime};base64,${b64}`;
            wv.injectJavaScript(`window.__tileCache && window.__tileCache.respond(${JSON.stringify(reqId)}, ${JSON.stringify(dataUri)});true;`);
          } else {
            wv.injectJavaScript(`window.__tileCache && window.__tileCache.respond(${JSON.stringify(reqId)}, null);true;`);
          }
        });
        return;
      }
      if (raw.type === "tileSave" && typeof raw.url === "string" && typeof raw.dataB64 === "string") {
        saveTileToCache(raw.url, raw.dataB64);
        return;
      }
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
      } else if (msg.type === "viewState" && msg.zoom != null) {
        setViewState({
          zoom: msg.zoom,
          minZoom: msg.minZoom ?? 0,
          maxZoom: msg.maxZoom ?? 22,
          bearing: msg.bearing ?? 0,
          lat: msg.lat ?? 0,
          lng: msg.lng ?? 0,
        });
      } else if (msg.type === "error") {
        onFatalErrorRef.current?.();
      }
    }, [users, easterEggs, onReady, onUserPress, onEasterEggPress, onRegionChangeComplete]);

    useImperativeHandle(ref, () => ({
      focusOnCoordinate: (coords: { latitude: number; longitude: number; userId?: string }) => {
        const payloadJson = JSON.stringify({ lat: coords.latitude, lng: coords.longitude, zoom: 15 });
        inject(`window.mlBridge && window.mlBridge.focusOn(${payloadJson})`);
      },
      invalidateSize: () => {
        inject("window.mlBridge && window.mlBridge.invalidateSize && window.mlBridge.invalidateSize()");
      },
    }), [inject]);

    const handleCenterOnUser = useCallback(() => {
      if (!realMeMarker) return;
      const payloadJson = JSON.stringify({ lat: realMeMarker.latitude, lng: realMeMarker.longitude });
      inject(`window.mlBridge && window.mlBridge.centerOnUser(${payloadJson})`);
    }, [realMeMarker, inject]);

    const handleZoomChange = useCallback((z: number) => {
      setViewState((prev) => ({ ...prev, zoom: z }));
      const payload = JSON.stringify({ zoom: z });
      inject(`window.mlBridge && window.mlBridge.setZoom(${payload})`);
    }, [inject]);

    const handleResetBearing = useCallback(() => {
      setViewState((prev) => ({ ...prev, bearing: 0 }));
      inject(`window.mlBridge && window.mlBridge.resetBearing()`);
    }, [inject]);

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
        {!showRouteDetailPanel && (
          <MapControls
            isAvailable={isAvailable}
            ghostMode={ghostMode}
            onCenterOnUser={handleCenterOnUser}
            availabilityBottomOffset={filterBarTopOffset != null ? 100 : undefined}
            locationButtonBottomOffset={filterBarTopOffset != null ? 205 : undefined}
          />
        )}
        {mapReady && !showRouteDetailPanel && (
          <MapStyleToggle
            currentStyleId={styleId}
            onSelectStyle={setStyle}
            bottomOffset={filterBarTopOffset != null ? 160 : undefined}
          />
        )}
        {mapReady && filterBarTopOffset != null && !showRouteDetailPanel && (
          <MapZoomSlider
            zoom={viewState.zoom}
            minZoom={viewState.minZoom}
            maxZoom={viewState.maxZoom}
            latitude={viewState.lat}
            topOffset={filterBarTopOffset + 72}
            bottomOffset={313}
            leftOffset={12}
            onZoomChange={handleZoomChange}
          />
        )}
        {mapReady && filterBarTopOffset != null && (
          <MapNorthCompass
            bearing={viewState.bearing}
            onResetBearing={handleResetBearing}
            topOffset={filterBarTopOffset + 10}
            leftOffset={15}
          />
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
});
