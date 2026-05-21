import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface GiriOfflineCardProps {
  status: 'none' | 'available' | 'downloading';
  progress: number;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

export const GiriOfflineCard: React.FC<GiriOfflineCardProps> = ({
  status,
  progress,
  onDownload,
  onCancel,
  onDelete,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.offlineCard}>
      <View style={s.offlineCardHeader}>
        <Ionicons name="cloud-offline-outline" size={20} color={colors.accent} />
        <Text style={s.offlineCardTitle}>Mappe Offline</Text>
        {status === "available" && (
          <View style={s.offlineAvailableBadge}>
            <Text style={s.offlineAvailableText}>SCARICATA</Text>
          </View>
        )}
      </View>

      {status === "none" && (
        <View style={{ gap: 8 }}>
          <Text style={s.offlineEstimate}>
            Scarica le mappe per navigare senza connessione dati. Occupa circa 15-30MB.
          </Text>
          <View style={s.offlineActions}>
            <Pressable onPress={onDownload} style={s.offlineBtn}>
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={s.offlineBtnText}>Scarica ora</Text>
            </Pressable>
          </View>
        </View>
      )}

      {status === "downloading" && (
        <View style={s.offlineProgressArea}>
          <View style={s.offlineProgressBg}>
            <View style={[s.offlineProgressFill, { width: `${progress * 100}%` as any }]} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={s.offlineProgressText}>Download in corso... {Math.round(progress * 100)}%</Text>
            <Pressable onPress={onCancel} style={[s.offlineBtn, s.offlineBtnCancel]}>
              <Text style={[s.offlineBtnText, { color: colors.accentRed }]}>Annulla</Text>
            </Pressable>
          </View>
        </View>
      )}

      {status === "available" && (
        <View style={{ gap: 8 }}>
          <Text style={s.offlineEstimate}>
            Il percorso è salvato localmente. Puoi navigare anche in assenza di segnale.
          </Text>
          <View style={s.offlineActions}>
            <Pressable onPress={onDelete} style={[s.offlineBtn, s.offlineBtnDelete]}>
              <Ionicons name="trash-outline" size={16} color={colors.accentRed} />
              <Text style={[s.offlineBtnText, { color: colors.accentRed }]}>Rimuovi mappe</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  offlineCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 20, gap: 10 },
  offlineCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  offlineCardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.text, flex: 1 },
  offlineAvailableBadge: { backgroundColor: "#22c55e22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  offlineAvailableText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#22c55e" },
  offlineEstimate: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary },
  offlineProgressArea: { gap: 6 },
  offlineProgressBg: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  offlineProgressFill: { height: "100%" as any, backgroundColor: colors.accent, borderRadius: 4 },
  offlineProgressText: { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary },
  offlineActions: { flexDirection: "row", gap: 8 },
  offlineBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  offlineBtnCancel: { backgroundColor: "rgba(239, 68, 68, 0.18)" },
  offlineBtnDelete: { backgroundColor: "rgba(239, 68, 68, 0.18)" },
  offlineBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
});
