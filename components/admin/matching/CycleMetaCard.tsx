/**
 * Task #2527 — CycleMetaCard.
 *
 * Card riassuntiva sullo stato del motore di matching + ultimo ciclo.
 * Estratto da `app/admin/match-control.tsx` per ridurne la dimensione
 * a < 250 righe per file.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface CycleMeta {
  completedAt: string;
  durationMs: number;
  zavorrinaMatchesNew: number;
  bikerBikerMatchesNew: number;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

interface Props {
  autoMatchEnabled: boolean;
  cycleMeta: CycleMeta | null;
  isLoading: boolean;
}

export function CycleMetaCard({ autoMatchEnabled, cycleMeta, isLoading }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <MaterialCommunityIcons
          name="engine"
          size={20}
          color={autoMatchEnabled ? Colors.success : Colors.textSecondary}
        />
        <Text style={styles.label}>Auto matching</Text>
        <View style={[styles.badge, { backgroundColor: (autoMatchEnabled ? Colors.success : Colors.border) + "22" }]}>
          <Text style={[styles.badgeText, { color: autoMatchEnabled ? Colors.success : Colors.textSecondary }]}>
            {autoMatchEnabled ? "ATTIVO" : "DISATTIVO"}
          </Text>
        </View>
      </View>
      {cycleMeta ? (
        <View style={styles.metaBlock}>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>Ultimo ciclo: {formatDate(cycleMeta.completedAt)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="speedometer-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>Durata: {formatDuration(cycleMeta.durationMs)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>
              Nuovi: {cycleMeta.bikerBikerMatchesNew} biker-biker, {cycleMeta.zavorrinaMatchesNew} biker-zavorrina
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.noMeta}>
          {isLoading ? "Caricamento..." : "Nessun ciclo completato ancora."}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.border, gap: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, flex: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5 },
  metaBlock: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 10, gap: 6, marginTop: 4,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  noMeta: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary,
    fontStyle: "italic", marginTop: 4,
  },
});
