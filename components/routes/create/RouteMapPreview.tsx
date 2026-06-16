import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import Colors from "@/constants/colors";

interface Waypoint { id?: string; name?: string; lat?: number; lng?: number; type?: string }
interface RouteMapPreviewProps {
  waypoints: Waypoint[];
  curvatureMapHtml: string;
  webviewRef: React.RefObject<WebView | null>;
  handleMapLoaded: () => void;
  routeStyle: "curvy" | "balanced" | "fastest";
  setRouteStyle: (style: "curvy" | "balanced" | "fastest") => void;
  isCalculatingRoute: boolean;
  routeStats: { distanceKm: number; durationMinutes: number } | null;
  trackPoints3D?: Array<{ lat: number; lng: number }>;
}

export const RouteMapPreview: React.FC<RouteMapPreviewProps> = ({
  waypoints, curvatureMapHtml, webviewRef, handleMapLoaded,
  routeStyle, setRouteStyle, isCalculatingRoute, routeStats,
}) => {
  if (waypoints.length < 2) return null;

  const styleMeta = {
    curvy: { label: "Panoramico", icon: "terrain" as const, color: "#4CAF50" },
    balanced: { label: "Bilanciato", icon: "swap-horizontal" as const, color: Colors.accent },
    fastest: { label: "Veloce", icon: "flash" as const, color: "#FF9800" },
  }[routeStyle];

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Stile percorso</Text>
        <View style={styles.styleSelector}>
          {(["curvy", "balanced", "fastest"] as const).map((s) => {
            const isActive = routeStyle === s;
            const meta = {
              curvy: { label: "Panoramico", icon: "terrain" as const, color: "#4CAF50" },
              balanced: { label: "Bilanciato", icon: "swap-horizontal" as const, color: Colors.accent },
              fastest: { label: "Veloce", icon: "flash" as const, color: "#FF9800" },
            }[s];
            return (
              <TouchableOpacity
                key={s}
                style={[styles.styleBtn, isActive && { borderColor: meta.color, backgroundColor: meta.color + "18" }]}
                onPress={() => setRouteStyle(s)}
                testID={`route-style-${s}`}
              >
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Ionicons name={meta.icon as any} size={18} color={isActive ? meta.color : Colors.textSecondary} />
                <Text style={[styles.styleBtnText, isActive && { color: meta.color, fontWeight: "700" as const }]}>
                  {meta.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {curvatureMapHtml !== "" && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Anteprima percorso (curvatura)</Text>
          <View style={styles.mapContainer}>
            <WebView
              ref={webviewRef}
              source={{ html: curvatureMapHtml, baseUrl: "" }}
              style={{ flex: 1 }}
              scrollEnabled={false}
              javaScriptEnabled
              originWhitelist={["*"]}
              onLoadEnd={handleMapLoaded}
            />
            <View style={[styles.styleBadge, { backgroundColor: styleMeta.color + "DD" }]}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Ionicons name={styleMeta.icon as any} size={12} color="#fff" />
              <Text style={styles.styleBadgeText}>{styleMeta.label}</Text>
            </View>
            {isCalculatingRoute && (
              <View style={styles.calcOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </View>
        </View>
      )}

      {routeStats && !isCalculatingRoute && (
        <View style={styles.routeStatsRow}>
          <Ionicons name="navigate" size={14} color={Colors.accent} />
          <Text style={styles.routeStatText}>
            {routeStats.distanceKm % 1 === 0 ? routeStats.distanceKm : routeStats.distanceKm.toFixed(1)} km
          </Text>
          <Text style={styles.routeStatSep}>·</Text>
          <Ionicons name="time-outline" size={14} color={Colors.accent} />
          <Text style={styles.routeStatText}>
            {routeStats.durationMinutes >= 60
              ? `${Math.floor(routeStats.durationMinutes / 60)}h ${routeStats.durationMinutes % 60 > 0 ? `${routeStats.durationMinutes % 60} min` : ""}`.trim()
              : `${routeStats.durationMinutes} min`}
          </Text>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6, fontWeight: "600" as const, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  styleSelector: { flexDirection: "row" as const, gap: 8, marginTop: 4 },
  styleBtn: {
    flex: 1, flexDirection: "row" as const, alignItems: "center" as const,
    justifyContent: "center" as const, gap: 6, borderWidth: 1.5,
    borderColor: Colors.border, borderRadius: 10, paddingVertical: 10,
    backgroundColor: Colors.surfaceLight,
  },
  styleBtnText: { fontSize: 13, fontWeight: "500" as const, color: Colors.textSecondary },
  mapContainer: { height: 200, borderRadius: 12, overflow: "hidden" as const, borderWidth: 1, borderColor: Colors.border },
  styleBadge: {
    position: "absolute" as const, bottom: 8, left: 8, flexDirection: "row" as const,
    alignItems: "center" as const, gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  styleBadgeText: { fontSize: 11, fontWeight: "700" as const, color: "#fff", letterSpacing: 0.3 },
  calcOverlay: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center" as const, alignItems: "center" as const },
  routeStatsRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, marginTop: 8, paddingHorizontal: 4, marginBottom: 16 },
  routeStatText: { fontSize: 13, fontWeight: "600" as const, color: Colors.text },
  routeStatSep: { fontSize: 13, color: Colors.textSecondary, marginHorizontal: 2 },
});
