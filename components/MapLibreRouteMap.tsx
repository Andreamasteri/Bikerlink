import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { buildMapLibreRouteMapHtml } from "@/lib/maplibre/map-builder";
import type { MapLibreRouteWaypoint } from "@/lib/maplibre/map-builder";
import Colors from "@/constants/colors";

interface MapLibreRouteMapProps {
  waypoints: MapLibreRouteWaypoint[];
  height?: number;
  typeColors?: Record<string, string>;
  showMarkers?: boolean;
  trackPoints?: Array<{ lat: number; lng: number; speedKmh?: number | null }>;
  onFallbackNeeded?: () => void;
}

export default function MapLibreRouteMap({
  waypoints,
  height,
  showMarkers = true,
  trackPoints,
  onFallbackNeeded,
}: MapLibreRouteMapProps) {
  const mapHtml = useMemo(
    () => buildMapLibreRouteMapHtml(
      waypoints,
      trackPoints ?? waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
      Colors.accent,
      showMarkers
    ),
    [waypoints, trackPoints, showMarkers]
  );
  const mapBaseUrl = getApiUrl();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [skeletonVisible, setSkeletonVisible] = useState(true);

  useEffect(() => {
    fadeAnim.setValue(0);
    setSkeletonVisible(true);
  }, [mapHtml, fadeAnim]);

  const handleLoadEnd = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setSkeletonVisible(false));
  };

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as { type: string };
        if (msg.type === "maplibreLoadError") {
          console.warn("[MapLibreRouteMap] MapLibre tile error — falling back to Leaflet");
          onFallbackNeeded?.();
        }
      } catch {
        // ignore
      }
    },
    [onFallbackNeeded]
  );

  const handleWebViewError = useCallback(() => {
    console.warn("[MapLibreRouteMap] WebView crashed — falling back to Leaflet");
    onFallbackNeeded?.();
  }, [onFallbackNeeded]);

  const containerStyle = height != null ? [styles.wrapper, { height }] : styles.fill;

  return (
    <View style={containerStyle}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
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
          onLoadEnd={handleLoadEnd}
          onMessage={handleMessage}
          onError={handleWebViewError}
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
