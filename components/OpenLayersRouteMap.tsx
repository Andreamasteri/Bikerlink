import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildOLRouteHtml } from "@/lib/openlayers/secondary-builders";
import { parseMessage } from "@/lib/openlayers/bridge-events";
import Colors from "@/constants/colors";
import type { RouteMapProps } from "@/lib/maps/types";
import { useMapTelemetry } from "@/hooks/useMapTelemetry";

export default function OpenLayersRouteMap({
  waypoints, height, typeColors: _typeColors, showMarkers: _showMarkers = true, trackPoints,
  onFatalError,
}: RouteMapProps) {
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;
  const tlm = useMapTelemetry("OpenLayersRouteMap", "openlayers");
  useEffect(() => {
    tlm.emit("map_init");
    return () => { tlm.emit("map_destroy"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapHtml = useMemo(
    () => buildOLRouteHtml(tileConfig.urlTemplate, waypoints, trackPoints, Colors.accent),
    [tileConfig.urlTemplate, waypoints, trackPoints]
  );

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [skeletonVisible, setSkeletonVisible] = useState(true);

  useEffect(() => {
    fadeAnim.setValue(0);
    setSkeletonVisible(true);
  }, [mapHtml, fadeAnim]);

  const handleLoadEnd = () => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start(() => setSkeletonVisible(false));
    tlm.emit("map_ready");
  };

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const msg = parseMessage(event.nativeEvent.data);
    if (msg?.type === "error") {
      tlm.emit("style_load_error");
      onFatalErrorRef.current?.();
    }
  }, [tlm]);

  const handleWebViewError = useCallback(() => {
    tlm.emit("webview_crash");
    onFatalErrorRef.current?.();
  }, [tlm]);

  const containerStyle = height != null ? [styles.wrapper, { height }] : styles.fill;

  return (
    <View style={containerStyle}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
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
          onLoadEnd={handleLoadEnd}
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
  skeleton: { backgroundColor: "#1e1e1e", alignItems: "center", justifyContent: "center" },
});
