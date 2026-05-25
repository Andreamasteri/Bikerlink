import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import { useMapConfig } from "@/lib/map-context";
import { getApiUrl } from "@/lib/query-client";
import { buildLeafletMiniMapHtml } from "@/lib/leaflet-mini-map-html";

interface LeafletMiniMapProps {
  latitude: number;
  longitude: number;
  height?: number;
}

export default function LeafletMiniMap({ latitude, longitude, height = 180 }: LeafletMiniMapProps) {
  const { enabled: mapsEnabled, activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const tileUrl = mapsEnabled ? activeTileUrl : "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
  const tileMaxZoom = mapsEnabled ? activeTileMaxZoom : 19;

  const mapHtml = useMemo(
    () => buildLeafletMiniMapHtml(tileUrl, tileMaxZoom, latitude, longitude),
    [latitude, longitude, tileUrl, tileMaxZoom]
  );
  const mapBaseUrl = getApiUrl();

  return (
    <View style={[styles.wrapper, { height }]} pointerEvents="none">
      <WebView
        source={{ html: mapHtml, baseUrl: mapBaseUrl }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["https://*", "http://*", "about:*"]}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        cacheEnabled={false}
        startInLoadingState={false}
        onError={(e) => console.warn("[LeafletMiniMap] WebView error:", e.nativeEvent.description)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden", borderRadius: 8 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
