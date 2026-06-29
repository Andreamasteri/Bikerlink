import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { useMapConfig } from "@/lib/map-context";
import { getApiUrl } from "@/lib/query-client";
import { buildLeafletTrackingMapHtml } from "@/lib/leaflet-tracking-map-html";
import { MapZoomSlider } from "@/components/map/MapZoomSlider";
import Colors from "@/constants/colors";
import { decimateTrack } from "@/lib/maps/track-decimate";

interface TrackingMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  currentLocation: { latitude: number; longitude: number } | null;
}

export default function LeafletTrackingMap({ points, currentLocation }: TrackingMapProps) {
  const webViewRef = useRef<WebView<{}>>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const pendingRef = useRef<{ points: typeof points; currentLocation: typeof currentLocation } | null>(null);
  const { enabled: mapsEnabled, activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const tileUrl = mapsEnabled ? activeTileUrl : "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
  const tileMaxZoom = mapsEnabled ? activeTileMaxZoom : 19;
  const [viewState, setViewState] = useState({
    zoom: 14, minZoom: 0, maxZoom: 22, lat: 0, lng: 0,
  });

  const mapHtml = useMemo(
    () => buildLeafletTrackingMapHtml(tileUrl, tileMaxZoom, Colors.accent, __DEV__),
    [tileUrl, tileMaxZoom]
  );
  const mapBaseUrl = getApiUrl();

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  const pushUpdate = useCallback(
    (pts: typeof points, loc: typeof currentLocation) => {
      if (pts.length === 0 && !loc) return;
      const data: { points: Array<{ lat: number; lng: number }>; current?: { lat: number; lng: number } } = {
        points: decimateTrack(pts.map((p) => ({ lat: p.latitude, lng: p.longitude }))),
      };
      if (loc) {
        data.current = { lat: loc.latitude, lng: loc.longitude };
      }
      const encoded = JSON.stringify(JSON.stringify(data));
      inject("window.trackingBridge && window.trackingBridge.updateLocation(" + encoded + ")");
    },
    [inject]
  );

  useEffect(() => {
    if (!bridgeReady) {
      pendingRef.current = { points, currentLocation };
      return;
    }
    pushUpdate(points, currentLocation);
  }, [bridgeReady, currentLocation, points, pushUpdate]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string; [key: string]: unknown };
      if (msg.type === "trackingReady") {
        setBridgeReady(true);
        if (pendingRef.current) {
          pushUpdate(pendingRef.current.points, pendingRef.current.currentLocation);
          pendingRef.current = null;
        }
      } else if (msg.type === "viewState") {
        const zoom = typeof msg.zoom === "number" ? msg.zoom : null;
        if (zoom == null) return;
        setViewState({
          zoom,
          minZoom: typeof msg.minZoom === "number" ? msg.minZoom : 0,
          maxZoom: typeof msg.maxZoom === "number" ? msg.maxZoom : 22,
          lat: typeof msg.lat === "number" ? msg.lat : 0,
          lng: typeof msg.lng === "number" ? msg.lng : 0,
        });
      } else if (__DEV__ && msg.type === "trackingCoordError") {
        console.warn("[LeafletTrackingMap] malformed location payload:", JSON.stringify(msg));
      }
    } catch {
      // no-op: ignore malformed bridge messages
    }
  }, [pushUpdate]);

  const handleZoomChange = useCallback((z: number) => {
    setViewState((prev) => ({ ...prev, zoom: z }));
    const payload = JSON.stringify({ zoom: z });
    inject("window.trackingBridge && window.trackingBridge.setZoom && window.trackingBridge.setZoom(" + payload + ")");
  }, [inject]);

  return (
    <View style={styles.wrapper}>
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError={(e: any) => console.warn("[LeafletTrackingMap] WebView error:", e.nativeEvent.description)}
      />
      {bridgeReady && (
        <MapZoomSlider
          zoom={viewState.zoom}
          minZoom={viewState.minZoom}
          maxZoom={viewState.maxZoom}
          latitude={viewState.lat}
          topOffset={12}
          onZoomChange={handleZoomChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, borderRadius: 12, overflow: "hidden" },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
