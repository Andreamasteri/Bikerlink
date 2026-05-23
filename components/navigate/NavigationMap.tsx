import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";

interface NavigationMapProps {
  mapHtml: string | null;
  webViewRef: React.RefObject<WebView>;
  handleMapMessage: (event: any) => void;
  handleClose: () => void;
  isRerouting: boolean;
  remainingKm: number | null;
  remainingMin: number | null;
  topPad: number;
  formatDuration: (mins: number) => string;
}

export function NavigationMap({
  mapHtml,
  webViewRef,
  handleMapMessage,
  handleClose,
  isRerouting,
  remainingKm,
  remainingMin,
  topPad,
  formatDuration,
}: NavigationMapProps) {
  const colors = useColors();
  const t = useT();
  const s = styles(colors);

  return (
    <View style={s.mapContainer}>
      {mapHtml ? (
        <WebView
          ref={webViewRef}
          source={{ html: mapHtml, baseUrl: "" }}
          style={s.map}
          javaScriptEnabled
          originWhitelist={["*"]}
          onMessage={handleMapMessage}
          scrollEnabled={false}
        />
      ) : (
        <View style={[s.map, { justifyContent: "center", alignItems: "center", backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons name="map-outline" size={40} color={colors.border} />
          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>{t("nav.map_unavailable")}</Text>
        </View>
      )}

      {/* Close button */}
      <Pressable style={[s.closeBtn, { top: topPad + 8 }]} onPress={handleClose} hitSlop={12}>
        <Ionicons name="close" size={20} color="#fff" />
      </Pressable>

      {/* Rerouting banner */}
      {isRerouting && (
        <View style={s.reroutingBanner}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={s.reroutingText}>{t("nav.rerouting")}</Text>
        </View>
      )}

      {/* Remaining info badge */}
      {remainingKm !== null && (
        <View style={s.remainingBadge}>
          <Text style={s.remainingKm}>{remainingKm.toFixed(1)} km</Text>
          {remainingMin !== null && (
            <Text style={s.remainingMin}>{formatDuration(remainingMin)}</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = (_colors: any) =>
  StyleSheet.create({
    mapContainer: {
      flex: 1,
      position: "relative",
    },
    map: {
      flex: 1,
    },
    closeBtn: {
      position: "absolute",
      left: 12,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(0,0,0,0.65)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },
    remainingBadge: {
      position: "absolute",
      top: 60,
      right: 12,
      backgroundColor: "rgba(0,0,0,0.75)",
      borderRadius: 12,
      padding: 10,
      alignItems: "center",
      minWidth: 70,
      zIndex: 10,
    },
    remainingKm: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
    remainingMin: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
    reroutingBanner: {
      position: "absolute",
      bottom: 12,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(0,0,0,0.82)",
      borderRadius: 20,
      paddingVertical: 10,
      paddingHorizontal: 18,
      zIndex: 10,
    },
    reroutingText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  });
