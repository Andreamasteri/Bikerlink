import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useMapConfig } from "@/lib/map-context";
import { getTileConfig } from "@/lib/map-tiles";
import { buildLeafletMiniMapHtml } from "@/lib/leaflet-mini-map-html";

interface LeafletMiniMapProps {
  latitude: number;
  longitude: number;
  height?: number;
}

export default function LeafletMiniMap({ latitude, longitude, height = 180 }: LeafletMiniMapProps) {
  const { enabled: mapsEnabled, resolvedProvider } = useMapConfig();
  const tileConfig = getTileConfig(mapsEnabled ? resolvedProvider : "carto_dark");

  const html = useMemo(
    () => buildLeafletMiniMapHtml(tileConfig.urlTemplate, tileConfig.maximumZ, latitude, longitude),
    [tileConfig.urlTemplate, tileConfig.maximumZ, latitude, longitude]
  );

  const srcDoc = html;

  return (
    <View style={[styles.wrapper, { height }]} pointerEvents="none">
      <iframe
        srcDoc={srcDoc}
        style={{ width: "100%", height: "100%", border: "none" }}
        sandbox="allow-scripts"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden", borderRadius: 8 },
});
