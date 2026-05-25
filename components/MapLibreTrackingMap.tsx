import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { buildMapLibreTrackingMapHtml } from "@/lib/maplibre/map-builder";
import Colors from "@/constants/colors";

interface TrackingMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  currentLocation: { latitude: number; longitude: number } | null;
  onFallbackNeeded?: () => void;
}

export default function MapLibreTrackingMap({ points, currentLocation, onFallbackNeeded }: TrackingMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const pendingRef = useRef<{ points: typeof points; currentLocation: typeof currentLocation } | null>(null);

  const mapHtml = useMemo(
    () => buildMapLibreTrackingMapHtml(Colors.accent),
    []
  );
  const mapBaseUrl = getApiUrl();

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
      const msg = JSON.parse(event.nativeEvent.data) as { type: string };
      if (msg.type === "trackingReady") {
        setBridgeReady(true);
        if (pendingRef.current) {
          pushUpdate(pendingRef.current.points, pendingRef.current.currentLocation);
          pendingRef.current = null;
        }
      } else if (msg.type === "maplibreLoadError") {
        console.warn("[MapLibreTrackingMap] MapLibre tile error — falling back to Leaflet");
        onFallbackNeeded?.();
      }
    } catch {
      // ignore malformed messages
    }
  }, [pushUpdate, onFallbackNeeded]);

  return (
    <View style={styles.wrapper}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml, baseUrl: mapBaseUrl }}
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
        onError={() => {
          console.warn("[MapLibreTrackingMap] WebView crashed — falling back to Leaflet");
          onFallbackNeeded?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, borderRadius: 12, overflow: "hidden" },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
