import React, { useMemo, useRef, useCallback, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { buildMapLibrePickerMapHtml } from "@/lib/maplibre/map-builder";
import type { MapLibreWaypoint } from "@/lib/maplibre/map-builder";
import Colors from "@/constants/colors";

interface MapLibrePickerMapProps {
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
  selectedCoord?: { lat: number; lng: number } | null;
  existingWaypoints?: MapLibreWaypoint[];
  onCoordPicked: (coord: { latitude: number; longitude: number }) => void;
  onFallbackNeeded?: () => void;
}

export default function MapLibrePickerMap({
  initialLat = 42.5,
  initialLng = 12.5,
  initialZoom = 6,
  selectedCoord = null,
  existingWaypoints = [],
  onCoordPicked,
  onFallbackNeeded,
}: MapLibrePickerMapProps) {
  const webViewRef = useRef<WebView>(null);
  const initialCoordRef = useRef(selectedCoord);

  const mapHtml = useMemo(
    () => buildMapLibrePickerMapHtml(
      initialLat, initialLng, initialZoom,
      existingWaypoints, initialCoordRef.current, Colors.accent
    ),
    [initialLat, initialLng, initialZoom, existingWaypoints]
  );
  const mapBaseUrl = getApiUrl();

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  useEffect(() => {
    if (!selectedCoord) return;
    inject(
      "window.pickerBridge && window.pickerBridge.setCoord(" +
        selectedCoord.lat + "," + selectedCoord.lng + ")"
    );
  }, [selectedCoord, inject]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as { type: string; lat?: number; lng?: number };
        if (msg.type === "coordPicked" && msg.lat != null && msg.lng != null) {
          onCoordPicked({ latitude: msg.lat, longitude: msg.lng });
        } else if (msg.type === "maplibreLoadError") {
          console.warn("[MapLibrePickerMap] MapLibre tile error — falling back to Leaflet");
          onFallbackNeeded?.();
        }
      } catch {
        // ignore malformed messages
      }
    },
    [onCoordPicked, onFallbackNeeded]
  );

  return (
    <View style={styles.fill}>
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
          console.warn("[MapLibrePickerMap] WebView crashed — falling back to Leaflet");
          onFallbackNeeded?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
