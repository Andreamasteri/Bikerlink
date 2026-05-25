import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

interface MatchStat {
  typeKey: string;
  typeName: string;
  usersActive: number;
  totalMatches: number;
  isAnomaly: boolean;
}

interface CycleMeta {
  completedAt: string;
  durationMs: number;
  zavarrinaMatchesNew: number;
  bikerBikerMatchesNew: number;
}

interface MatchSettingsResponse {
  visible: boolean;
  autoMatchEnabled?: boolean;
  cycleMeta?: CycleMeta | null;
  stats: MatchStat[];
}

interface MatchingStatsResponse {
  bikerBiker: { new: number; accepted: number; rejected: number; total: number };
  bikerZavorrina: { new: number; accepted: number; rejected: number; total: number };
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

export default function MatchControlScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [recalcStatus, setRecalcStatus] = useState<"idle" | "running" | "done">("idle");
  const [resetStatus, setResetStatus] = useState<"idle" | "running" | "done">("idle");

  const { data, isLoading, refetch } = useQuery<MatchSettingsResponse>({
    queryKey: ["/api/admin/match-settings"],
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const { data: matchingStats } = useQuery<MatchingStatsResponse>({
    queryKey: ["/api/admin/matching-stats"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (val: boolean) => {
      await apiRequest("PUT", "/api/admin/settings/match_preferences_visible", {
        value: val ? "true" : "false",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/match-settings"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile aggiornare l'impostazione"),
  });

  const handleResetAll = () => {
    Alert.alert(
      "Reset preferenze",
      "Riportare TUTTE le preferenze di matching degli utenti ai valori di default (tutto attivo)? Operazione non reversibile.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              setResetStatus("running");
              const res = await apiRequest("POST", "/api/admin/match-settings/reset-all");
              const json = await res.json();
              setResetStatus("done");
              Alert.alert(
                "Reset completato",
                `Preferenze ripristinate per ${json.affected ?? 0} utenti.`,
              );
              setTimeout(() => setResetStatus("idle"), 3000);
              refetch();
            } catch {
              setResetStatus("idle");
              Alert.alert("Errore", "Impossibile resettare le preferenze.");
            }
          },
        },
      ],
    );
  };

  const handleRecalcAll = async () => {
    Alert.alert(
      "Ricalcola tutto",
      "Avviare un ciclo completo del motore di matching per tutti gli utenti?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Avvia",
          style: "default",
          onPress: async () => {
            try {
              setRecalcStatus("running");
              const res = await apiRequest("POST", "/api/admin/matches/recalculate-all");
              const json = await res.json();
              setRecalcStatus("done");
              if (json.started) {
                Alert.alert("Ciclo avviato", "Il motore di matching è stato avviato in background.");
              } else {
                Alert.alert("Non avviato", json.reason ?? "Il ciclo non è stato avviato.");
              }
              setTimeout(() => setRecalcStatus("idle"), 3000);
              refetch();
            } catch {
              setRecalcStatus("idle");
              Alert.alert("Errore", "Impossibile avviare il ricalcolo.");
            }
          },
        },
      ],
    );
  };

  const visible = data?.visible ?? false;
  const autoMatchEnabled = data?.autoMatchEnabled ?? true;
  const cycleMeta = data?.cycleMeta ?? null;
  const stats = data?.stats ?? [];
  const anomalies = stats.filter((s) => s.isAnomaly);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stato Motore</Text>

        <View style={styles.engineCard}>
          <View style={styles.engineRow}>
            <MaterialCommunityIcons
              name="engine"
              size={20}
              color={autoMatchEnabled ? Colors.success : Colors.textSecondary}
            />
            <Text style={styles.engineLabel}>Auto matching</Text>
            <View style={[styles.engineBadge, { backgroundColor: autoMatchEnabled ? Colors.success + "22" : Colors.border }]}>
              <Text style={[styles.engineBadgeText, { color: autoMatchEnabled ? Colors.success : Colors.textSecondary }]}>
                {autoMatchEnabled ? "ATTIVO" : "DISATTIVO"}
              </Text>
            </View>
          </View>

          {cycleMeta ? (
            <View style={styles.cycleMetaBlock}>
              <View style={styles.cycleMetaRow}>
                <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.cycleMetaText}>
                  Ultimo ciclo: {formatDate(cycleMeta.completedAt)}
                </Text>
              </View>
              <View style={styles.cycleMetaRow}>
                <Ionicons name="speedometer-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.cycleMetaText}>
                  Durata: {formatDuration(cycleMeta.durationMs)}
                </Text>
              </View>
              <View style={styles.cycleMetaRow}>
                <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.cycleMetaText}>
                  Nuovi: {cycleMeta.bikerBikerMatchesNew} biker-biker, {cycleMeta.zavarrinaMatchesNew} biker-zavarrina
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.noMetaText}>
              {isLoading ? "Caricamento..." : "Nessun ciclo completato ancora."}
            </Text>
          )}
        </View>
      </View>

      {matchingStats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistiche Match</Text>
          <View style={styles.statsCard}>
            <View style={styles.statsHeaderRow}>
              <Text style={[styles.statsHeaderCell, { flex: 2 }]} />
              <Text style={[styles.statsHeaderCell, { flex: 1 }]}>Nuovi</Text>
              <Text style={[styles.statsHeaderCell, { flex: 1 }]}>Accettati</Text>
              <Text style={[styles.statsHeaderCell, { flex: 1 }]}>Rifiutati</Text>
              <Text style={[styles.statsHeaderCell, { flex: 1 }]}>Tot.</Text>
            </View>
            <View style={styles.statsDataRow}>
              <Text style={[styles.statsLabel, { flex: 2 }]}>Biker-Biker</Text>
              <Text style={[styles.statsValue, { flex: 1 }]}>{matchingStats.bikerBiker.new}</Text>
              <Text style={[styles.statsValue, { flex: 1 }, styles.accepted]}>{matchingStats.bikerBiker.accepted}</Text>
              <Text style={[styles.statsValue, { flex: 1 }, styles.rejected]}>{matchingStats.bikerBiker.rejected}</Text>
              <Text style={[styles.statsValue, { flex: 1 }]}>{matchingStats.bikerBiker.total}</Text>
            </View>
            <View style={[styles.statsDataRow, styles.statsDataRowAlt]}>
              <Text style={[styles.statsLabel, { flex: 2 }]}>Biker-Zavarrina</Text>
              <Text style={[styles.statsValue, { flex: 1 }]}>{matchingStats.bikerZavorrina.new}</Text>
              <Text style={[styles.statsValue, { flex: 1 }, styles.accepted]}>{matchingStats.bikerZavorrina.accepted}</Text>
              <Text style={[styles.statsValue, { flex: 1 }, styles.rejected]}>{matchingStats.bikerZavorrina.rejected}</Text>
              <Text style={[styles.statsValue, { flex: 1 }]}>{matchingStats.bikerZavorrina.total}</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Visibilità Preferenze</Text>
        <View style={styles.toggleCard}>
          <View style={styles.toggleLeft}>
            <MaterialCommunityIcons
              name={visible ? "eye" : "eye-off"}
              size={24}
              color={visible ? Colors.success : Colors.textSecondary}
            />
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleLabel}>
                Sezione preferenze match visibile agli utenti
              </Text>
              <Text style={styles.toggleSubtext}>
                {visible
                  ? "Gli utenti vedono e gestiscono i propri switch"
                  : "La sezione è nascosta per tutti gli utenti"}
              </Text>
            </View>
          </View>
          <Switch
            value={visible}
            onValueChange={(val) => toggleMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.success + "88" }}
            thumbColor={visible ? Colors.success : Colors.textSecondary}
            disabled={toggleMutation.isPending}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Motore Matching</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={15} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.recalcAllBtn,
            recalcStatus === "running" && { opacity: 0.7 },
            recalcStatus === "done" && { backgroundColor: Colors.success },
          ]}
          onPress={handleRecalcAll}
          disabled={recalcStatus === "running"}
          activeOpacity={0.8}
        >
          {recalcStatus === "running" ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : recalcStatus === "done" ? (
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
          ) : (
            <MaterialCommunityIcons name="refresh-circle" size={20} color="#fff" />
          )}
          <Text style={styles.recalcAllText}>
            {recalcStatus === "running"
              ? "Avvio in corso..."
              : recalcStatus === "done"
              ? "Ciclo avviato!"
              : "Ricalcola tutto"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.resetAllBtn,
            resetStatus === "running" && { opacity: 0.7 },
            resetStatus === "done" && { backgroundColor: Colors.success, borderColor: Colors.success },
          ]}
          onPress={handleResetAll}
          disabled={resetStatus === "running"}
          activeOpacity={0.8}
        >
          {resetStatus === "running" ? (
            <ActivityIndicator size="small" color={Colors.warning} />
          ) : resetStatus === "done" ? (
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
          ) : (
            <MaterialCommunityIcons name="restore" size={20} color={Colors.warning} />
          )}
          <Text
            style={[
              styles.resetAllText,
              resetStatus === "done" && { color: "#fff" },
            ]}
          >
            {resetStatus === "running"
              ? "Reset in corso..."
              : resetStatus === "done"
              ? "Reset completato!"
              : "Reset preferenze utenti"}
          </Text>
        </TouchableOpacity>

        {anomalies.length > 0 && (
          <View style={styles.anomalyBanner}>
            <Ionicons name="warning" size={16} color={Colors.warning} />
            <Text style={styles.anomalyText}>
              {anomalies.length} tipo{anomalies.length > 1 ? "i" : ""} con 0 match — verifica configurazione
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statistiche per Tipo di Match</Text>

        {isLoading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.typeStatsTable}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, { flex: 3 }]}>Tipo</Text>
              <Text style={[styles.tableCell, styles.tableCellCenter, { flex: 1.2 }]}>Utenti attivi</Text>
              <Text style={[styles.tableCell, styles.tableCellCenter, { flex: 1 }]}>Match</Text>
              <Text style={[styles.tableCell, styles.tableCellCenter, { flex: 0.8 }]}>Stato</Text>
            </View>

            {stats.map((stat, idx) => (
              <View
                key={stat.typeKey}
                style={[
                  styles.tableRow,
                  idx % 2 === 0 && { backgroundColor: Colors.surfaceLight + "44" },
                  stat.isAnomaly && styles.anomalyRow,
                ]}
              >
                <Text style={[styles.tableCell, styles.tableTypeName, { flex: 3 }]} numberOfLines={2}>
                  {stat.typeName}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellCenter, { flex: 1.2 }]}>
                  {stat.usersActive}
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    styles.tableCellCenter,
                    { flex: 1 },
                    stat.isAnomaly && { color: Colors.warning },
                  ]}
                >
                  {stat.totalMatches}
                </Text>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- StyleSheet style merging */}
                <View style={[styles.tableCell, styles.tableCellCenter as any, { flex: 0.8 }]}>
                  {stat.isAnomaly ? (
                    <Ionicons name="warning" size={14} color={Colors.warning} />
                  ) : (
                    <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { marginHorizontal: 12, marginTop: 16 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  engineCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  engineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  engineLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  engineBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  engineBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  cycleMetaBlock: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginTop: 4,
  },
  cycleMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cycleMetaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  noMetaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: "italic",
    marginTop: 4,
  },
  statsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  statsHeaderRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statsHeaderCell: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  statsDataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statsDataRowAlt: {
    backgroundColor: Colors.surfaceLight + "44",
  },
  statsLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  statsValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    textAlign: "center",
  },
  accepted: { color: Colors.success },
  rejected: { color: Colors.error },
  toggleCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  toggleLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  toggleTextWrap: { flex: 1, gap: 2 },
  toggleLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  toggleSubtext: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recalcAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    marginBottom: 12,
  },
  recalcAllText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
  resetAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: Colors.warning + "15",
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.warning + "55",
  },
  resetAllText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.warning },
  anomalyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.warning + "22",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.warning + "55",
  },
  anomalyText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.warning, flex: 1 },
  typeStatsTable: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  anomalyRow: {
    backgroundColor: Colors.warning + "11",
  },
  tableCell: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
  },
  tableCellCenter: { textAlign: "center", alignItems: "center", justifyContent: "center" },
  tableTypeName: { fontFamily: "Inter_500Medium", fontSize: 12 },
});
