import React, { useMemo, useRef, useEffect, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildLeafletPickerMapHtml, type PickerWaypoint } from "@/lib/leaflet-picker-map-html";
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");
  const initialCoordRef = useRef(selectedCoord);

  const html = useMemo(
    () =>
      buildLeafletPickerMapHtml(
        tileConfig.urlTemplate,
        tileConfig.maximumZ,
        initialLat,
        initialLng,
        initialZoom,
        existingWaypoints,
        initialCoordRef.current,
        Colors.accent
      ),
    [tileConfig.urlTemplate, tileConfig.maximumZ, initialLat, initialLng, initialZoom, existingWaypoints]
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const msg = JSON.parse(event.data) as { type: string; lat?: number; lng?: number };
        if (msg.type === "coordPicked" && msg.lat != null && msg.lng != null) {
          onCoordPicked({ latitude: msg.lat, longitude: msg.lng });
        }
      } catch {}
    },
    [onCoordPicked]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (!selectedCoord) return;
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: "setCoord", lat: selectedCoord.lat, lng: selectedCoord.lng }),
      "*"
    );
  }, [selectedCoord]);

  return (
    <View style={styles.fill}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{ width: "100%", height: "100%", border: "none" }}
        sandbox="allow-scripts"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
