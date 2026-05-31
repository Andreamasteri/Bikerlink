import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { ThemeColors } from '@/constants/colors';

interface GiriActionsProps {
  onNavigate: () => void;
  onOpenGoogleMaps: () => void;
  onOpenWaze: () => void;
  onOpenAppleMaps: () => void;
  onExportGPX: () => void;
  onExportKML: () => void;
  onShare: () => void;
}

export const GiriActions: React.FC<GiriActionsProps> = ({
  onNavigate,
  onOpenGoogleMaps,
  onOpenWaze,
  onOpenAppleMaps,
  onExportGPX,
  onExportKML,
  onShare,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View>
      <Pressable style={s.navigateBtn} onPress={onNavigate}>
        <Ionicons name="navigate" size={20} color="#fff" />
        <Text style={s.navigateBtnText}>AVVIA NAVIGAZIONE INTERNA</Text>
      </Pressable>

      <View style={s.externalAppsRow}>
        <Pressable style={s.externalAppBtn} onPress={onOpenGoogleMaps}>
          <Ionicons name="map-outline" size={16} color={colors.textSecondary} />
          <Text style={s.externalAppLabel}>Google Maps</Text>
        </Pressable>
        <Pressable style={s.externalAppBtn} onPress={onOpenWaze}>
          <Ionicons name="navigate-outline" size={16} color={colors.textSecondary} />
          <Text style={s.externalAppLabel}>Waze</Text>
        </Pressable>
        <Pressable style={s.externalAppBtn} onPress={onOpenAppleMaps}>
          <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
          <Text style={s.externalAppLabel}>Apple Maps</Text>
        </Pressable>
      </View>

      <View style={s.actionsGrid}>
        <Pressable style={s.actionCard} onPress={onExportGPX}>
          <Ionicons name="download-outline" size={24} color={colors.accent} />
          <Text style={s.actionLabel}>Esporta GPX</Text>
        </Pressable>
        <Pressable style={s.actionCard} onPress={onExportKML}>
          <Ionicons name="earth-outline" size={24} color={colors.accent} />
          <Text style={s.actionLabel}>Esporta KML</Text>
        </Pressable>
        <Pressable style={s.actionCard} onPress={onShare}>
          <Ionicons name="share-social-outline" size={24} color={colors.accent} />
          <Text style={s.actionLabel}>Condividi</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = (colors: ThemeColors) => StyleSheet.create({
  navigateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  navigateBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  externalAppsRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  externalAppBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  externalAppLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: colors.textSecondary },
  actionsGrid: { flexDirection: "row", gap: 10, marginBottom: 20 },
  actionCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 14, alignItems: "center", gap: 6 },
  actionLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.text },
});
