import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { useMapConfig } from "@/lib/map-context";
import { getApiUrl } from "@/lib/query-client";
import { buildLeafletRouteMapHtml } from "@/lib/leaflet-route-map-html";
import type { RouteWaypoint } from "@/lib/leaflet-route-map-html";
import { MapZoomSlider } from "@/components/map/MapZoomSlider";
import Colors from "@/constants/colors";
import { useMapTelemetry } from "@/hooks/useMapTelemetry";

interface LeafletRouteMapProps {
  waypoints: RouteWaypoint[];
  height?: number;
  typeColors?: Record<string, string>;
  showMarkers?: boolean;
  trackPoints?: Array<{ lat: number; lng: number; speedKmh?: number | null }>;
}

export default function LeafletRouteMap({ waypoints, height, typeColors, showMarkers = true, trackPoints }: LeafletRouteMapProps) {
  const { enabled: mapsEnabled, activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const tileUrl = mapsEnabled ? activeTileUrl : "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
  const tileMaxZoom = mapsEnabled ? activeTileMaxZoom : 19;

  const webViewRef = useRef<WebView<{}>>(null);
  const tlm = useMapTelemetry("LeafletRouteMap", "leaflet");
  const initStartRef = useRef<number>(Date.now());
  useEffect(() => {
    initStartRef.current = Date.now();
    tlm.emit("map_init");
    return () => { tlm.emit("map_destroy"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mapHtml = useMemo(
    () => buildLeafletRouteMapHtml(
      tileUrl, tileMaxZoom,
      waypoints, Colors.accent, typeColors || {}, showMarkers, trackPoints || []
    ),
    [tileUrl, tileMaxZoom, waypoints, typeColors, showMarkers, trackPoints]
  );
  const mapBaseUrl = getApiUrl();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [skeletonVisible, setSkeletonVisible] = useState(true);
  const [viewState, setViewState] = useState({
    zoom: 6, minZoom: 0, maxZoom: tileMaxZoom,
    bearing: 0, lat: 41.9, lng: 12.5,
  });

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

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type: string;
        zoom?: number; minZoom?: number; maxZoom?: number; bearing?: number;
        lat?: number; lng?: number;
      };
      if (msg.type === "viewState" && msg.zoom != null) {
        setViewState({
          zoom: msg.zoom,
          minZoom: msg.minZoom ?? 0,
          maxZoom: msg.maxZoom ?? tileMaxZoom,
          bearing: msg.bearing ?? 0,
          lat: msg.lat ?? 0,
          lng: msg.lng ?? 0,
        });
      }
    } catch {
      // no-op
    }
  }, [tileMaxZoom]);

  const handleZoomChange = useCallback((z: number) => {
    setViewState((prev) => ({ ...prev, zoom: z }));
    inject("window.leafletRouteBridge && window.leafletRouteBridge.setZoom && window.leafletRouteBridge.setZoom(" + z + ")");
  }, [inject]);

  const containerStyle = height != null ? [styles.wrapper, { height }] : styles.fill;

  return (
    <View style={containerStyle}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
        <WebView
          ref={webViewRef}
          source={{ html: mapHtml, baseUrl: mapBaseUrl }}
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
          onLoadEnd={handleLoadEnd}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onError={(e: any) => console.warn("[LeafletRouteMap] WebView error:", e.nativeEvent.description)}
        />
      </Animated.View>
      {skeletonVisible && (
        <View style={[StyleSheet.absoluteFill, styles.skeleton]}>
          <MaterialCommunityIcons name="map-outline" size={48} color={Colors.textSecondary} />
        </View>
      )}
      {!skeletonVisible && (
        <MapZoomSlider
          zoom={viewState.zoom}
          minZoom={viewState.minZoom}
          maxZoom={viewState.maxZoom}
          latitude={viewState.lat}
          topOffset={12}
          onZoomChange={handleZoomChange}
        />
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
