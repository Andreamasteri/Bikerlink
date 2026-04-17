import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildLeafletRouteMapHtml, type RouteWaypoint } from "@/lib/leaflet-route-map-html";
import Colors from "@/constants/colors";

interface LeafletRouteMapProps {
  waypoints: RouteWaypoint[];
  height?: number;
  typeColors?: Record<string, string>;
  showMarkers?: boolean;
  trackPoints?: Array<{ lat: number; lng: number }>;
}

export default function LeafletRouteMap({ waypoints, height, typeColors, showMarkers = true, trackPoints }: LeafletRouteMapProps) {
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");

  const html = useMemo(
    () => buildLeafletRouteMapHtml(tileConfig.urlTemplate, tileConfig.maximumZ, waypoints, Colors.accent, typeColors, showMarkers, trackPoints),
    [tileConfig.urlTemplate, tileConfig.maximumZ, waypoints, typeColors, showMarkers, trackPoints]
  );

  const containerStyle = height != null ? [styles.wrapper, { height }] : styles.fill;

  return (
    <View style={containerStyle}>
      <iframe
        srcDoc={html}
        style={{ width: "100%", height: "100%", border: "none" }}
        sandbox="allow-scripts"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden" },
  fill: { flex: 1 },
});
