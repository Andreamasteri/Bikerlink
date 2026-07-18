/**
 * Admin: monitor unificato delle AI di BikerLink (Bowie/Horus/Ares).
 * Online/offline, latenza, storico transizioni persistito (thinkcentre_health_events).
 * (Task #591: Quebracho unified into Horus.)
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

type AgentPersona = "bowie" | "horus" | "ares";

interface AgentMonitorSnapshot {
  persona: AgentPersona;
  configured: boolean;
  online: boolean;
  latencyMs: number | null;
  activeJobs: number | null;
  error?: string;
}

interface MonitorResponse {
  agents: AgentMonitorSnapshot[];
  checkedAt: string;
}

interface HistoryEntry {
  id: string;
  serviceKey: string | null;
  transitionFrom: string;
  transitionTo: string;
  occurredAt: string;
}

const PERSONA_LABEL: Record<AgentPersona, string> = {
  bowie: "Bowie (assistente)",
  horus: "Horus (routing · coordinator)",
  ares: "Ares (diagnostica)",
};

const PERSONA_ICON: Record<AgentPersona, keyof typeof MaterialCommunityIcons.glyphMap> = {
  bowie: "robot-outline",
  horus: "map-marker-path",
  ares: "cog-outline",
};

export default function AiMonitorScreen() {
  const insets = useSafeAreaInsets();
  const [selectedPersona, setSelectedPersona] = useState<AgentPersona | null>(null);

  const monitorQuery = useQuery<MonitorResponse>({
    queryKey: ["/api/admin/ai-monitor"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ai-monitor")).json(),
    refetchInterval: 20_000,
  });

  const historyQuery = useQuery<{ entries: HistoryEntry[] }>({
    queryKey: ["/api/admin/ai-monitor/history", selectedPersona],
    queryFn: async () =>
      (await apiRequest("GET", `/api/admin/ai-monitor/history?persona=${selectedPersona}&limit=30`)).json(),
    enabled: !!selectedPersona,
  });

  const agents = monitorQuery.data?.agents ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
      <Text style={styles.subtitle}>Stato in tempo reale delle 4 AI. Tocca una card per lo storico transizioni.</Text>
      <View style={styles.grid}>
        {agents.map((agent) => (
          <TouchableOpacity
            key={agent.persona}
            style={[
              styles.card,
              selectedPersona === agent.persona ? { borderColor: Colors.primary } : null,
            ]}
            onPress={() => setSelectedPersona((prev) => (prev === agent.persona ? null : agent.persona))}
            testID={`ai-monitor-card-${agent.persona}`}
          >
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name={PERSONA_ICON[agent.persona]} size={22} color={Colors.text} />
              <View
                style={[
                  styles.dot,
                  { backgroundColor: !agent.configured ? Colors.textSecondary : agent.online ? "#22C55E" : Colors.error },
                ]}
              />
            </View>
            <Text style={styles.cardLabel}>{PERSONA_LABEL[agent.persona]}</Text>
            <Text style={styles.cardStatus}>
              {!agent.configured ? "Non configurato" : agent.online ? "Online" : "Offline"}
              {agent.latencyMs != null ? ` · ${agent.latencyMs}ms` : ""}
            </Text>
            {agent.activeJobs != null ? (
              <Text style={styles.cardJobs}>{agent.activeJobs} job attivi</Text>
            ) : null}
            {agent.error ? (
              <Text style={styles.cardError} numberOfLines={2}>{agent.error}</Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {selectedPersona ? (
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Storico transizioni — {PERSONA_LABEL[selectedPersona]}</Text>
          {(historyQuery.data?.entries ?? []).length === 0 ? (
            <Text style={styles.emptyText}>Nessuna transizione registrata (stabile da quando il monitor è attivo).</Text>
          ) : (
            historyQuery.data!.entries.map((entry) => (
              <View key={entry.id} style={styles.historyRow}>
                <Text style={styles.historyText}>
                  {entry.transitionFrom} → {entry.transitionTo}
                </Text>
                <Text style={styles.historyTime}>
                  {new Date(entry.occurredAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2 },
  cardStatus: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  cardJobs: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardError: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.error, marginTop: 4 },
  historySection: { marginTop: 24 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, marginBottom: 10 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text },
  historyTime: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
});
