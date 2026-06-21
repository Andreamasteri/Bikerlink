import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useMapConfig } from "@/lib/map-context";
import { getApiUrl } from "@/lib/query-client";
import { LEAFLET_JS, LEAFLET_CSS } from "@/lib/leaflet-bundle";
import { useColors } from "@/hooks/useColors";
import Colors from "@/constants/colors";

const MIN_GPS_POINTS = 5;

interface GpsPoint {
  lat: number;
  lon: number;
}

interface Props {
  points: GpsPoint[];
}

function buildStaticTrackHtml(
  points: GpsPoint[],
  tileUrl: string,
  tileMaxZoom: number,
  accentColor: string
): string {
  const serialized = JSON.stringify(
    points.map((p) => ({ lat: p.lat, lng: p.lon }))
  );
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; background: #1a1a1a; }
.leaflet-container { background: #1a1a1a !important; }
.leaflet-control-zoom { display: none !important; }
.leaflet-control-attribution { font-size: 8px !important; opacity: 0.4; }
</style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function() {
  var pts = ${serialized};
  var accentColor = ${JSON.stringify(accentColor)};
  var tileUrl = ${JSON.stringify(tileUrl)};
  var tileMaxZoom = ${tileMaxZoom};

  var map = L.map("map", {
    center: [41.9, 12.5],
    zoom: 13,
    zoomControl: false,
    attributionControl: true,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false
  });

  L.tileLayer(tileUrl, { maxZoom: tileMaxZoom, attribution: "" }).addTo(map);

  if (pts.length > 1) {
    var polyline = L.polyline(pts.map(function(p) { return [p.lat, p.lng]; }), {
      color: accentColor,
      weight: 4,
      opacity: 0.9
    }).addTo(map);

    var startPt = pts[0];
    var endPt = pts[pts.length - 1];

    L.circleMarker([startPt.lat, startPt.lng], {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: "#27ae60",
      fillOpacity: 1
    }).addTo(map);

    L.circleMarker([endPt.lat, endPt.lng], {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: "#e74c3c",
      fillOpacity: 1
    }).addTo(map);

    map.fitBounds(polyline.getBounds(), { padding: [20, 20] });
  }
})();
</script>
</body>
</html>`;
}

export default function GpsLapTrackMap({ points }: Props) {
  const colors = useColors();
  const { enabled: mapsEnabled, activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const tileUrl = mapsEnabled
    ? activeTileUrl
    : "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
  const tileMaxZoom = mapsEnabled ? activeTileMaxZoom : 19;
  const mapBaseUrl = getApiUrl();

  const validPoints = useMemo(
    () => points.filter((p) => isFinite(p.lat) && isFinite(p.lon)),
    [points]
  );

  const s = styles(colors);

  if (validPoints.length < MIN_GPS_POINTS) {
    return (
      <View style={s.noGpsCard}>
        <Ionicons name="location-outline" size={22} color={colors.textSecondary} />
        <Text style={s.noGpsText}>GPS non disponibile per questo giro</Text>
      </View>
    );
  }

  const mapHtml = buildStaticTrackHtml(validPoints, tileUrl, tileMaxZoom, Colors.accent);

  return (
    <View style={s.container}>
      <Text style={s.label}>Traccia GPS</Text>
      <View style={s.mapWrapper}>
        <WebView
          source={{ html: mapHtml, baseUrl: mapBaseUrl }}
          style={s.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={["https://*", "http://*", "about:*"]}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          cacheEnabled={false}
          startInLoadingState={false}
          onError={(e) =>
            console.warn("[GpsLapTrackMap] WebView error:", e.nativeEvent.description)
          }
        />
        <View style={s.legend}>
          <View style={[s.dot, { backgroundColor: "#27ae60" }]} />
          <Text style={s.legendText}>Inizio</Text>
          <View style={[s.dot, { backgroundColor: "#e74c3c", marginLeft: 10 }]} />
          <Text style={s.legendText}>Fine</Text>
        </View>
      </View>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    label: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
      marginBottom: 8,
    },
    mapWrapper: {
      height: 220,
      borderRadius: 8,
      overflow: "hidden",
      position: "relative",
    },
    map: {
      flex: 1,
      backgroundColor: "#1a1a1a",
    },
    legend: {
      position: "absolute",
      bottom: 8,
      left: 8,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      gap: 4,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: "#fff",
    },
    legendText: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: "#fff",
    },
    noGpsCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 16,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    noGpsText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
    },
  });
