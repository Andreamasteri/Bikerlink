import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import Colors from "@/constants/colors";

interface RouteMapPreviewProps {
  waypoints: any[];
  curvatureMapHtml: string;
  webviewRef: React.RefObject<any>;
  handleMapLoaded: () => void;
  routeStyle: "curvy" | "balanced" | "fastest";
  setRouteStyle: (style: "curvy" | "balanced" | "fastest") => void;
  isCalculatingRoute: boolean;
  routeStats: { distanceKm: number; durationMinutes: number } | null;
}

export const RouteMapPreview: React.FC<RouteMapPreviewProps> = ({
  waypoints,
  curvatureMapHtml,
  webviewRef,
  handleMapLoaded,
  routeStyle,
  setRouteStyle,
  isCalculatingRoute,
  routeStats,
}) => {
  if (waypoints.length < 2) return null;

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
          <View style={{ height: 200, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: Colors.border }}>
            <WebView
              ref={webviewRef}
              source={{ html: curvatureMapHtml, baseUrl: "" }}
              style={{ flex: 1 }}
              scrollEnabled={false}
              javaScriptEnabled
              originWhitelist={["*"]}
              onLoadEnd={handleMapLoaded}
            />
            {/* Style badge overlay */}
            {(() => {
              const styleMeta = {
                curvy: { label: "Panoramico", icon: "terrain" as any, color: "#4CAF50" },
                balanced: { label: "Bilanciato", icon: "swap-horizontal" as any, color: Colors.accent },
                fastest: { label: "Veloce", icon: "flash" as any, color: "#FF9800" },
              }[routeStyle];
              return (
                <View style={[styles.styleBadge, { backgroundColor: styleMeta.color + "DD" }]}>
                  <Ionicons name={styleMeta.icon} size={12} color="#fff" />
                  <Text style={styles.styleBadgeText}>{styleMeta.label}</Text>
                </View>
              );
            })()}
            {isCalculatingRoute && (
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </View>
          {routeStats && !isCalculatingRoute && (
            <View style={styles.routeStatsRow}>
              <Ionicons name="navigate" size={14} color={Colors.accent} />
              <Text style={styles.routeStatText}>{routeStats.distanceKm % 1 === 0 ? routeStats.distanceKm : routeStats.distanceKm.toFixed(1)} km</Text>
              <Text style={styles.routeStatSep}>·</Text>
              <Ionicons name="time-outline" size={14} color={Colors.accent} />
              <Text style={styles.routeStatText}>
                {routeStats.durationMinutes >= 60
                  ? `${Math.floor(routeStats.durationMinutes / 60)}h ${routeStats.durationMinutes % 60 > 0 ? `${routeStats.durationMinutes % 60} min` : ""}`.trim()
                  : `${routeStats.durationMinutes} min`}
              </Text>
            </View>
          )}
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  styleSelector: {
    flexDirection: "row" as const,
    gap: 8,
    marginTop: 4,
  },
  styleBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: Colors.surfaceLight,
  },
  styleBtnText: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: Colors.textSecondary,
  },
  styleBadge: {
    position: "absolute" as const,
    bottom: 8,
    left: 8,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  styleBadgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#fff",
    letterSpacing: 0.3,
  },
  routeStatsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  routeStatText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  routeStatSep: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginHorizontal: 2,
  },
});
