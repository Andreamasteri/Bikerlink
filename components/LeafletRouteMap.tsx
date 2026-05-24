import React, { useMemo, useState, useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { getApiUrl } from "@/lib/query-client";
import type { RouteWaypoint } from "@/lib/leaflet-route-map-html";
import Colors from "@/constants/colors";

interface LeafletRouteMapProps {
  waypoints: RouteWaypoint[];
  height?: number;
  typeColors?: Record<string, string>;
  showMarkers?: boolean;
  trackPoints?: Array<{ lat: number; lng: number; speedKmh?: number | null }>;
}

export default function LeafletRouteMap({ waypoints, height, typeColors, showMarkers = true, trackPoints }: LeafletRouteMapProps) {
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");

  const mapUri = useMemo(() => {
    const base = getApiUrl() + "/leaflet-route-map.html";
    return (
      base +
      "?tileUrl=" + encodeURIComponent(tileConfig.urlTemplate) +
      "&tileMaxZoom=" + tileConfig.maximumZ +
      "&waypoints=" + encodeURIComponent(JSON.stringify(waypoints)) +
      "&accentColor=" + encodeURIComponent(Colors.accent) +
      "&typeColors=" + encodeURIComponent(JSON.stringify(typeColors || {})) +
      "&showMarkers=" + (showMarkers ? "true" : "false") +
      "&trackPoints=" + encodeURIComponent(JSON.stringify(trackPoints || []))
    );
  }, [tileConfig.urlTemplate, tileConfig.maximumZ, waypoints, typeColors, showMarkers, trackPoints]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [skeletonVisible, setSkeletonVisible] = useState(true);

  useEffect(() => {
    fadeAnim.setValue(0);
    setSkeletonVisible(true);
  }, [mapUri, fadeAnim]);

  const handleLoadEnd = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setSkeletonVisible(false));
  };

  const containerStyle = height != null ? [styles.wrapper, { height }] : styles.fill;

  return (
    <View style={containerStyle}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
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
          onLoadEnd={handleLoadEnd}
          onError={(e) => console.warn("[LeafletRouteMap] WebView error:", e.nativeEvent.description)}
          onHttpError={(e) => console.warn("[LeafletRouteMap] HTTP error:", e.nativeEvent.statusCode, mapUri)}
        />
      </Animated.View>
      {skeletonVisible && (
        <View style={[StyleSheet.absoluteFill, styles.skeleton]}>
          <MaterialCommunityIcons name="map-outline" size={48} color={Colors.textSecondary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden" },
  fill: { flex: 1 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
  skeleton: {
    backgroundColor: "#1e1e1e",
    alignItems: "center",
    justifyContent: "center",
  },
});
