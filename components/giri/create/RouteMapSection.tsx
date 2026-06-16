import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

interface RouteMapSectionProps {
  plannerMapHtml: string;
  webviewRef: React.RefObject<WebView>;
  onMapTap: (lat: number, lng: number) => void;
  isApproxRoute: boolean;
  calculating: boolean;
  renderer?: string;
  waypoints3D?: Array<{ lat: number; lng: number }>;
}

export const RouteMapSection: React.FC<RouteMapSectionProps> = ({
  plannerMapHtml,
  webviewRef,
  onMapTap,
  isApproxRoute,
  calculating,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Mappa percorso</Text>
      <View style={s.plannerMapContainer}>
        <WebView
          ref={webviewRef}
          source={{ html: plannerMapHtml, baseUrl: "" }}
          style={s.plannerMap}
          scrollEnabled={false}
          javaScriptEnabled
          originWhitelist={["*"]}
          onMessage={(e) => {
            try {
              const msg = JSON.parse(e.nativeEvent.data);
              if (msg.type === "tap") onMapTap(msg.lat, msg.lng);
            } catch {
              // no-op: ignore malformed bridge messages
            }
          }}
        />
        <View style={s.mapHintBadge}>
          <Ionicons name="location-outline" size={12} color="#fff" />
          <Text style={s.mapHintText}>Tocca per aggiungere tappe</Text>
        </View>
        {isApproxRoute && (
          <View style={s.approxBanner}>
            <Ionicons name="warning-outline" size={13} color="#f97316" />
            <Text style={s.approxBannerText}>percorso approssimativo</Text>
          </View>
        )}
        {calculating && (
          <View style={s.calcSpinnerBadge}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: { marginBottom: 20 },
    sectionLabel: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    plannerMapContainer: {
      height: 220,
      borderRadius: 14,
      overflow: "hidden",
      position: "relative",
      borderWidth: 1,
      borderColor: colors.border,
    },
    plannerMap: { flex: 1 },
    mapHintBadge: {
      position: "absolute",
      top: 8,
      left: "50%",
      transform: [{ translateX: -70 }],
      backgroundColor: "rgba(0,0,0,0.7)",
      borderRadius: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    mapHintText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#fff" },
    approxBanner: {
      position: "absolute",
      top: 10,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- StyleSheet percentage string
      left: "50%" as any,
      transform: [{ translateX: -90 }],
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(0,0,0,0.75)",
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: "#f9731650",
    },
    approxBannerText: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#f97316" },
    calcSpinnerBadge: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(0,0,0,0.65)",
      alignItems: "center",
      justifyContent: "center",
    },
  });
