import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildLeafletMiniMapHtml } from "@/lib/leaflet-mini-map-html";

interface LeafletMiniMapProps {
  latitude: number;
  longitude: number;
  height?: number;
}

export default function LeafletMiniMap({ latitude, longitude, height = 180 }: LeafletMiniMapProps) {
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");

  const html = useMemo(
    () => buildLeafletMiniMapHtml(tileConfig.urlTemplate, tileConfig.maximumZ, latitude, longitude),
    [tileConfig.urlTemplate, tileConfig.maximumZ, latitude, longitude]
  );

  return (
    <View style={[styles.wrapper, { height }]} pointerEvents="none">
      <WebView
        source={{ html, baseUrl: "" }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["https://*", "http://*", "about:*"]}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        cacheEnabled={true}
        startInLoadingState={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden", borderRadius: 8 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
