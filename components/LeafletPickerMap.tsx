import React, { useMemo, useRef, useCallback, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildLeafletPickerMapHtml, type PickerWaypoint } from "@/lib/leaflet-picker-map-html";
import Colors from "@/constants/colors";

interface LeafletPickerMapProps {
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
  selectedCoord?: { lat: number; lng: number } | null;
  existingWaypoints?: PickerWaypoint[];
  onCoordPicked: (coord: { latitude: number; longitude: number }) => void;
}

export default function LeafletPickerMap({
  initialLat = 42.5,
  initialLng = 12.5,
  initialZoom = 6,
  selectedCoord = null,
  existingWaypoints = [],
  onCoordPicked,
}: LeafletPickerMapProps) {
  const webViewRef = useRef<WebView>(null);
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");

  const initialCoordRef = useRef(selectedCoord);

  const html = useMemo(
    () =>
      buildLeafletPickerMapHtml(
        tileConfig.urlTemplate,
        tileConfig.maximumZ,
        initialLat,
        initialLng,
        initialZoom,
        existingWaypoints,
        initialCoordRef.current,
        Colors.accent
      ),
    [tileConfig.urlTemplate, tileConfig.maximumZ, initialLat, initialLng, initialZoom, existingWaypoints]
  );

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  useEffect(() => {
    if (!selectedCoord) return;
    inject(
      "window.pickerBridge && window.pickerBridge.setCoord(" +
        selectedCoord.lat +
        "," +
        selectedCoord.lng +
        ")"
    );
  }, [selectedCoord, inject]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as { type: string; lat?: number; lng?: number };
        if (msg.type === "coordPicked" && msg.lat != null && msg.lng != null) {
          onCoordPicked({ latitude: msg.lat, longitude: msg.lng });
        }
      } catch {}
    },
    [onCoordPicked]
  );

  return (
    <View style={styles.fill}>
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
  fill: { flex: 1 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
