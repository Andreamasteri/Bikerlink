import React, { useMemo, useRef, useCallback, useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { useMapConfig } from "@/lib/map-context";
import { getApiUrl } from "@/lib/query-client";
import { buildLeafletPickerMapHtml } from "@/lib/leaflet-picker-map-html";
import type { PickerWaypoint } from "@/lib/leaflet-picker-map-html";
import { MapZoomSlider } from "@/components/map/MapZoomSlider";
import Colors from "@/constants/colors";

interface LeafletPickerMapProps {
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
  selectedCoord?: { lat: number; lng: number } | null;
  existingWaypoints?: PickerWaypoint[];
  onCoordPicked: (coord: { latitude: number; longitude: number }) => void;
}

export default function LeafletPickerMap({
  initialLat = 42.5,
  initialLng = 12.5,
  initialZoom = 6,
  selectedCoord = null,
  existingWaypoints = [],
  onCoordPicked,
}: LeafletPickerMapProps) {
  const webViewRef = useRef<WebView<{}>>(null);
  const { enabled: mapsEnabled, activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const tileUrl = mapsEnabled ? activeTileUrl : "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
  const tileMaxZoom = mapsEnabled ? activeTileMaxZoom : 19;

  const initialCoordRef = useRef(selectedCoord);
  const [viewState, setViewState] = useState({
    zoom: initialZoom, minZoom: 0, maxZoom: tileMaxZoom,
    bearing: 0, lat: initialLat, lng: initialLng,
  });

  const mapHtml = useMemo(
    () => buildLeafletPickerMapHtml(
      tileUrl, tileMaxZoom,
      initialLat, initialLng, initialZoom,
      existingWaypoints, initialCoordRef.current, Colors.accent
    ),
    [tileUrl, tileMaxZoom, initialLat, initialLng, initialZoom, existingWaypoints]
  );
  const mapBaseUrl = getApiUrl();

  const inject = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ";true;");
  }, []);

  useEffect(() => {
    if (!selectedCoord) return;
    inject(
      "window.pickerBridge && window.pickerBridge.setCoord(" +
        selectedCoord.lat +
        "," +
        selectedCoord.lng +
        ")"
    );
  }, [selectedCoord, inject]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          type: string;
          lat?: number; lng?: number;
          zoom?: number; minZoom?: number; maxZoom?: number; bearing?: number;
        };
        if (msg.type === "coordPicked" && msg.lat != null && msg.lng != null) {
          onCoordPicked({ latitude: msg.lat, longitude: msg.lng });
        } else if (msg.type === "viewState" && msg.zoom != null) {
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
        // no-op: ignore malformed bridge messages
      }
    },
    [onCoordPicked, tileMaxZoom]
  );

  const handleZoomChange = useCallback((z: number) => {
    setViewState((prev) => ({ ...prev, zoom: z }));
    inject("window.pickerBridge && window.pickerBridge.setZoom && window.pickerBridge.setZoom(" + z + ")");
  }, [inject]);

  return (
    <View style={styles.fill}>
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError={(e: any) => console.warn("[LeafletPickerMap] WebView error:", e.nativeEvent.description)}
      />
      <MapZoomSlider
        zoom={viewState.zoom}
        minZoom={viewState.minZoom}
        maxZoom={viewState.maxZoom}
        latitude={viewState.lat}
        topOffset={12}
        onZoomChange={handleZoomChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  map: { flex: 1, backgroundColor: "#1a1a1a" },
});
