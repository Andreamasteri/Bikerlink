import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildLeafletTrackingMapHtml } from "@/lib/leaflet-tracking-map-html";
import Colors from "@/constants/colors";

interface TrackingMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  currentLocation: { latitude: number; longitude: number } | null;
}

export default function LeafletTrackingMap({ points, currentLocation }: TrackingMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const pendingRef = useRef<{ points: typeof points; currentLocation: typeof currentLocation } | null>(null);
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");

  const html = useMemo(
    () => buildLeafletTrackingMapHtml(tileConfig.urlTemplate, tileConfig.maximumZ, Colors.accent, __DEV__),
    [tileConfig.urlTemplate, tileConfig.maximumZ]
  );

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  const pushUpdate = useCallback(
    (pts: typeof points, loc: typeof currentLocation) => {
      if (pts.length === 0 && !loc) return;
      const data: { points: Array<{ lat: number; lng: number }>; current?: { lat: number; lng: number } } = {
        points: pts.map((p) => ({ lat: p.latitude, lng: p.longitude })),
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
      } else if (__DEV__ && msg.type === "trackingCoordError") {
        console.warn("[LeafletTrackingMap] malformed location payload:", JSON.stringify(msg));
      }
    } catch {
      // no-op: ignore malformed bridge messages
    }
  }, [pushUpdate]);

  return (
    <View style={styles.wrapper}>
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: "" }}
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, borderRadius: 12, overflow: "hidden" },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
