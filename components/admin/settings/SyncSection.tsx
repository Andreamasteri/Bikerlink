import React from "react";
import { View as RNView, Text as RNText, StyleSheet as RNStyleSheet, TouchableOpacity as RNTouchableOpacity, ActivityIndicator as RNActivityIndicator } from "react-native";
import { Ionicons as IoniconsSet } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const styles = RNStyleSheet.create({
  paidCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.warning,
  },
  synecoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  synecoInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  synecoLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  synecoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.accent },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.background },
});

interface SyncSectionProps {
  syncStatus: {
    available: boolean;
    inProgress: boolean;
    lastSync: { startedAt: string; finishedAt?: string; ok: boolean; error?: string } | null;
    nextScheduledAt: string | null;
  } | undefined;
  onSyncNow: () => void;
  syncPending: boolean;
}

export function SyncSection({
  syncStatus,
  onSyncNow,
  syncPending,
}: SyncSectionProps) {
  return (
    <RNView style={styles.paidCard}>
      <RNView style={styles.synecoHeader}>
        <RNView style={styles.synecoInfo}>
          <IoniconsSet name="sync-outline" size={20} color={Colors.accent} />
          <RNText style={styles.synecoLabel}>Sync Produzione → Sviluppo</RNText>
        </RNView>
      </RNView>
      {!syncStatus?.available ? (
        <RNText style={styles.synecoDesc}>
          Non disponibile — impostare DATABASE_URL_DEV (branch dev Neon, diverso da DATABASE_URL) nell'ambiente di sviluppo.
        </RNText>
      ) : (
        <>
          {syncStatus.lastSync ? (
            <RNView style={{ marginBottom: 6 }}>
              <RNText style={styles.synecoDesc}>
                Ultimo sync: {new Date(syncStatus.lastSync.startedAt).toLocaleString("it-IT")}{" "}
                {syncStatus.lastSync.ok
                  ? <RNText style={{ color: Colors.accent }}>✓ OK</RNText>
                  : <RNText style={{ color: Colors.error ?? "#e74c3c" }}>✗ Errore</RNText>}
              </RNText>
              {!syncStatus.lastSync.ok && syncStatus.lastSync.error && (
                <RNText style={[styles.synecoDesc, { color: Colors.error ?? "#e74c3c", marginTop: 2 }]} numberOfLines={2}>
                  {syncStatus.lastSync.error}
                </RNText>
              )}
            </RNView>
          ) : (
            <RNText style={styles.synecoDesc}>Nessun sync eseguito finora.</RNText>
          )}
          {syncStatus.nextScheduledAt && (
            <RNText style={styles.synecoDesc}>
              Prossimo sync automatico: {new Date(syncStatus.nextScheduledAt).toLocaleString("it-IT")}
            </RNText>
          )}
          <RNTouchableOpacity
            style={[styles.saveBtn, { marginTop: 10, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, opacity: (syncStatus.inProgress || syncPending) ? 0.5 : 1 }]}
            onPress={onSyncNow}
            disabled={syncStatus.inProgress || syncPending}
          >
            {(syncStatus.inProgress || syncPending) ? (
              <RNActivityIndicator color="#fff" size="small" />
            ) : (
              <IoniconsSet name="sync" size={16} color="#fff" />
            )}
            <RNText style={styles.saveBtnText}>
              {(syncStatus.inProgress || syncPending) ? "Sync in corso..." : "Sincronizza ora"}
            </RNText>
          </RNTouchableOpacity>
        </>
      )}
    </RNView>
  );
}
