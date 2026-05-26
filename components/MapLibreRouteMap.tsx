import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildMapLibreRouteHtml } from "@/lib/maplibre/secondary-builders";
import { getMapLibreStyleExpr } from "@/lib/maplibre/tile-config";
import { parseMessage } from "@/lib/maplibre/bridge-events";
import { MapZoomSlider } from "@/components/map/MapZoomSlider";
import { MapNorthCompass } from "@/components/map/MapNorthCompass";
import Colors from "@/constants/colors";
import type { RouteMapProps } from "@/lib/maps/types";

export default function MapLibreRouteMap({
  waypoints, height, typeColors: _typeColors, showMarkers: _showMarkers = true, trackPoints,
  onFatalError,
}: RouteMapProps) {
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");
  const styleExpr = getMapLibreStyleExpr(tileConfig.urlTemplate);
  const webViewRef = useRef<WebView>(null);
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;
  const [viewState, setViewState] = useState({
    zoom: 10, minZoom: 0, maxZoom: 22, bearing: 0, lat: 45.5, lng: 10.5,
  });

  const mapHtml = useMemo(
    () => buildMapLibreRouteHtml(styleExpr, waypoints, trackPoints, Colors.accent),
    [styleExpr, waypoints, trackPoints]
  );

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [skeletonVisible, setSkeletonVisible] = useState(true);

  useEffect(() => {
    fadeAnim.setValue(0);
    setSkeletonVisible(true);
  }, [mapHtml, fadeAnim]);

  const handleLoadEnd = () => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 300, useNativeDriver: true,
    }).start(() => setSkeletonVisible(false));
  };

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const msg = parseMessage(event.nativeEvent.data);
    if (!msg) return;
    if (msg.type === "viewState" && msg.zoom != null) {
      setViewState({
        zoom: msg.zoom,
        minZoom: msg.minZoom ?? 0,
        maxZoom: msg.maxZoom ?? 22,
        bearing: msg.bearing ?? 0,
        lat: msg.lat ?? 0,
        lng: msg.lng ?? 0,
      });
    } else if (msg.type === "error") {
      onFatalErrorRef.current?.();
    }
  }, []);

  const handleWebViewError = useCallback(() => {
    onFatalErrorRef.current?.();
  }, []);

  const handleZoomChange = useCallback((z: number) => {
    setViewState((prev) => ({ ...prev, zoom: z }));
    const payload = JSON.stringify({ zoom: z });
    inject(`window.mlBridge && window.mlBridge.setZoom && window.mlBridge.setZoom(${payload})`);
  }, [inject]);

  const handleResetBearing = useCallback(() => {
    setViewState((prev) => ({ ...prev, bearing: 0 }));
    inject(`window.mlBridge && window.mlBridge.resetBearing && window.mlBridge.resetBearing()`);
  }, [inject]);

  const containerStyle = height != null ? [styles.wrapper, { height }] : styles.fill;

  return (
    <View style={containerStyle}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
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
          onLoadEnd={handleLoadEnd}
          onError={handleWebViewError}
        />
      </Animated.View>
      {skeletonVisible && (
        <View style={[StyleSheet.absoluteFill, styles.skeleton]}>
          <MaterialCommunityIcons name="map-outline" size={48} color={Colors.textSecondary} />
        </View>
      )}
      {!skeletonVisible && (
        <>
          <MapZoomSlider
            zoom={viewState.zoom}
            minZoom={viewState.minZoom}
            maxZoom={viewState.maxZoom}
            latitude={viewState.lat}
            topOffset={12}
            onZoomChange={handleZoomChange}
          />
          <MapNorthCompass
            bearing={viewState.bearing}
            onResetBearing={handleResetBearing}
            topOffset={12}
          />
        </>
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
