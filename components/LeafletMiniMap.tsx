import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { getApiUrl } from "@/lib/query-client";

interface LeafletMiniMapProps {
  latitude: number;
  longitude: number;
  height?: number;
}

export default function LeafletMiniMap({ latitude, longitude, height = 180 }: LeafletMiniMapProps) {
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");

  const mapUri = useMemo(() => {
    const base = getApiUrl() + "/leaflet-mini-map.html";
    return (
      base +
      "?lat=" + latitude +
      "&lng=" + longitude +
      "&tileUrl=" + encodeURIComponent(tileConfig.urlTemplate) +
      "&tileMaxZoom=" + tileConfig.maximumZ
    );
  }, [latitude, longitude, tileConfig.urlTemplate, tileConfig.maximumZ]);

  return (
    <View style={[styles.wrapper, { height }]} pointerEvents="none">
      <WebView
        source={{ uri: mapUri }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["https://*", "http://*", "about:*"]}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        cacheEnabled={true}
        startInLoadingState={false}
        onError={(e) => console.warn("[LeafletMiniMap] WebView error:", e.nativeEvent.description)}
        onHttpError={(e) => console.warn("[LeafletMiniMap] HTTP error:", e.nativeEvent.statusCode, mapUri)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden", borderRadius: 8 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
