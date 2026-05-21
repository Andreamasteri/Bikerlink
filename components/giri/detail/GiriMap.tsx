import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface GiriMapProps {
  mapHtml: string | null;
  style: string;
  distanceKm: number;
  offlineStatus: string;
  streetViewTip: boolean;
  onMessage: (event: any) => void;
}

export const GiriMap: React.FC<GiriMapProps> = ({
  mapHtml,
  style,
  distanceKm,
  offlineStatus,
  streetViewTip,
  onMessage,
}) => {
  const colors = useColors();
  const s = styles(colors);

  if (!mapHtml) {
    return (
      <View style={s.mapPlaceholder}>
        <Ionicons name="map-outline" size={32} color={colors.textSecondary} />
        <Text style={s.mapPlaceholderText}>Caricamento mappa...</Text>
      </View>
    );
  }

  return (
    <View style={s.mapContainer}>
      <WebView
        source={{ html: mapHtml, baseUrl: "" }}
        style={s.map}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={["*"]}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        onMessage={onMessage}
      />
      <View style={s.mapOverlayBadge}>
        <MaterialCommunityIcons
          name={style === "extra_curvy" || style === "curvy" ? "road-variant" : style === "fast" || style === "direct" ? "rocket-launch-outline" : "scale-balance"}
          size={12} color="#fff"
        />
        <Text style={s.mapOverlayText}>{distanceKm} km</Text>
      </View>
      {offlineStatus === "available" && (
        <View style={s.offlineBadge}>
          <Ionicons name="cloud-offline-outline" size={12} color="#22c55e" />
          <Text style={s.offlineBadgeText}>Offline</Text>
        </View>
      )}
      {streetViewTip && (
        <View style={s.streetViewTip}>
          <Ionicons name="eye-outline" size={12} color="#fff" />
          <Text style={s.streetViewTipText}>Tocca il percorso per Street View</Text>
        </View>
      )}
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  mapContainer: { height: 200, borderRadius: 14, overflow: "hidden", marginBottom: 14, position: "relative" },
  map: { flex: 1 },
  mapOverlayBadge: { position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  mapOverlayText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  streetViewTip: { position: "absolute", bottom: 8, left: 8, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  streetViewTipText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#fff" },
  mapPlaceholder: { height: 160, borderRadius: 14, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center", marginBottom: 14, gap: 8 },
  mapPlaceholderText: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary },
  offlineBadge: { position: "absolute", bottom: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  offlineBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#22c55e" },
});
