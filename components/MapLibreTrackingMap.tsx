import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildMapLibreTrackingHtml } from "@/lib/maplibre/secondary-builders";
import { getMapLibreStyleExpr } from "@/lib/maplibre/tile-config";
import { parseMessage } from "@/lib/maplibre/bridge-events";
import Colors from "@/constants/colors";
import type { TrackingMapProps } from "@/lib/maps/types";

export default function MapLibreTrackingMap({ points, currentLocation, onFatalError }: TrackingMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const pendingRef = useRef<{ points: typeof points; currentLocation: typeof currentLocation } | null>(null);
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");
  const styleExpr = getMapLibreStyleExpr(tileConfig.urlTemplate);
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;

  const mapHtml = useMemo(
    () => buildMapLibreTrackingHtml(styleExpr, Colors.accent),
    [styleExpr]
  );

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  const pushUpdate = useCallback((
    pts: typeof points,
    loc: typeof currentLocation
  ) => {
    if (pts.length === 0 && !loc) return;
    const data = {
      points: pts.map((p) => ({ lat: p.latitude, lng: p.longitude })),
      current: loc ? { lat: loc.latitude, lng: loc.longitude } : undefined,
    };
    const encoded = JSON.stringify(JSON.stringify(data));
    inject(`window.mlBridge && window.mlBridge.updateLocation(${encoded})`);
  }, [inject]);

  useEffect(() => {
    if (!bridgeReady) {
      pendingRef.current = { points, currentLocation };
      return;
    }
    pushUpdate(points, currentLocation);
  }, [bridgeReady, points, currentLocation, pushUpdate]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const msg = parseMessage(event.nativeEvent.data);
    if (!msg) return;
    if (msg.type === "trackingReady") {
      setBridgeReady(true);
      if (pendingRef.current) {
        pushUpdate(pendingRef.current.points, pendingRef.current.currentLocation);
        pendingRef.current = null;
      }
    } else if (msg.type === "error") {
      onFatalErrorRef.current?.();
    }
  }, [pushUpdate]);

  const handleWebViewError = useCallback(() => {
    onFatalErrorRef.current?.();
  }, []);

  return (
    <View style={styles.wrapper}>
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
        onError={handleWebViewError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, borderRadius: 12, overflow: "hidden" },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
