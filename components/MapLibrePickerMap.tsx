import React, { useMemo, useRef, useCallback, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildMapLibrePickerHtml } from "@/lib/maplibre/secondary-builders";
import { getMapLibreStyleExpr } from "@/lib/maplibre/tile-config";
import { parseMessage } from "@/lib/maplibre/bridge-events";
import Colors from "@/constants/colors";
import type { PickerMapProps } from "@/lib/maps/types";

interface MapLibrePickerMapProps extends PickerMapProps {
  onFatalError?: () => void;
}

export default function MapLibrePickerMap({
  initialLat = 42.5,
  initialLng = 12.5,
  initialZoom = 6,
  selectedCoord = null,
  existingWaypoints: _existingWaypoints = [],
  onCoordPicked,
  onFatalError,
}: MapLibrePickerMapProps) {
  const webViewRef = useRef<WebView>(null);
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");
  const styleExpr = getMapLibreStyleExpr(tileConfig.urlTemplate);
  const initialCoordRef = useRef(selectedCoord);
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;

  const mapHtml = useMemo(
    () => buildMapLibrePickerHtml(
      styleExpr, initialLat, initialLng, initialZoom,
      initialCoordRef.current, Colors.accent
    ),
    [styleExpr, initialLat, initialLng, initialZoom]
  );

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  useEffect(() => {
    if (!selectedCoord) return;
    const payloadJson = JSON.stringify({ lat: selectedCoord.lat, lng: selectedCoord.lng });
    inject(`window.mlBridge && window.mlBridge.setCoord(${payloadJson})`);
  }, [selectedCoord, inject]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const msg = parseMessage(event.nativeEvent.data);
    if (!msg) return;
    if (msg.type === "coordPicked" && msg.lat != null && msg.lng != null) {
      onCoordPicked({ latitude: msg.lat, longitude: msg.lng });
    } else if (msg.type === "error") {
      onFatalErrorRef.current?.();
    }
  }, [onCoordPicked]);

  const handleWebViewError = useCallback(() => {
    onFatalErrorRef.current?.();
  }, []);

  return (
    <View style={styles.fill}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
