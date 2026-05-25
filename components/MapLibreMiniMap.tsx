import React, { useMemo, useRef, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildMapLibreMiniHtml } from "@/lib/maplibre/secondary-builders";
import { getMapLibreStyleExpr } from "@/lib/maplibre/tile-config";
import { parseMessage } from "@/lib/maplibre/bridge-events";
import type { MiniMapProps } from "@/lib/maps/types";

export default function MapLibreMiniMap({ latitude, longitude, height = 180, onFatalError }: MiniMapProps) {
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");
  const styleExpr = getMapLibreStyleExpr(tileConfig.urlTemplate);
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;

  const mapHtml = useMemo(
    () => buildMapLibreMiniHtml(styleExpr, latitude, longitude),
    [styleExpr, latitude, longitude]
  );

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const msg = parseMessage(event.nativeEvent.data);
    if (msg?.type === "error") onFatalErrorRef.current?.();
  }, []);

  const handleWebViewError = useCallback(() => {
    onFatalErrorRef.current?.();
  }, []);

  return (
    <View style={[styles.wrapper, { height }]} pointerEvents="none">
      <WebView
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
  wrapper: { overflow: "hidden", borderRadius: 8 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
