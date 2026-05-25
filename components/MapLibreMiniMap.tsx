import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { buildMapLibreMiniMapHtml } from "@/lib/maplibre/map-builder";

interface MapLibreMiniMapProps {
  latitude: number;
  longitude: number;
  height?: number;
}

export default function MapLibreMiniMap({ latitude, longitude, height = 180 }: MapLibreMiniMapProps) {
  const mapHtml = useMemo(
    () => buildMapLibreMiniMapHtml(latitude, longitude),
    [latitude, longitude]
  );
  const mapBaseUrl = getApiUrl();

  return (
    <View style={[styles.wrapper, { height }]} pointerEvents="none">
      <WebView
        source={{ html: mapHtml, baseUrl: mapBaseUrl }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["*"]}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        cacheEnabled={false}
        startInLoadingState={false}
        mixedContentMode="always"
        onError={(e) => console.warn("[MapLibreMiniMap] WebView error:", e.nativeEvent.description)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden", borderRadius: 8 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
