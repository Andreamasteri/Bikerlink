import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface OtaStuckEventRow {
  id: number;
  device_id: string;
  rollback_count: number;
  stuck_sessions: number;
  runtime_version: string | null;
  created_at: string;
}

export interface OtaStuckEventsResponse {
  events: OtaStuckEventRow[];
  total: number;
  uniqueDevices: number;
  uniqueRvs: number;
  lastEventAt: string | null;
  limit: number;
  filter: { runtimeVersion: string | null };
}

interface OtaStuckEventsCardProps {
  data: OtaStuckEventsResponse | undefined;
  rvFilter: string;
  onRvFilterChange: (v: string) => void;
  onRefresh: () => void;
  isFetching: boolean;
  formatTimestamp: (iso: string) => string;
}

export const OtaStuckEventsCard: React.FC<OtaStuckEventsCardProps> = ({
  data,
  rvFilter,
  onRvFilterChange,
  onRefresh,
  isFetching,
  formatTimestamp,
}) => {
  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const uniqueDevices = data?.uniqueDevices ?? 0;
  const lastEventAt = data?.lastEventAt ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="warning-outline" size={18} color="#FF8800" />
        <Text style={styles.cardTitle}>Stuck-State Events</Text>
        <View style={[styles.badge, { backgroundColor: total > 0 ? "#AA4400" : "#444" }]}>
          <Text style={styles.badgeText}>{total}</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={isFetching} style={{ marginLeft: 8 }}>
          {isFetching ? (
            <ActivityIndicator size="small" color="#FF8800" />
          ) : (
            <Ionicons name="refresh" size={18} color="#FF8800" />
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.hintText}>
        Circuit breaker attivato · {uniqueDevices} dispositiv{uniqueDevices === 1 ? "o" : "i"} affett{uniqueDevices === 1 ? "o" : "i"} · aggiornato ogni 30s
      </Text>
      {lastEventAt != null && (
        <Text style={[styles.hintText, { marginTop: 2 }]}>
          Ultimo evento: {formatTimestamp(lastEventAt)}
        </Text>
      )}

      <View style={styles.filterRow}>
        <TextInput
          style={[styles.filterInput, { flex: 1 }]}
          placeholder="Filtra per runtimeVersion…"
          placeholderTextColor={Colors.textMuted ?? "#888"}
          value={rvFilter}
          onChangeText={onRvFilterChange}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {rvFilter.trim().length > 0 && (
          <TouchableOpacity
            onPress={() => onRvFilterChange("")}
            style={[styles.actionBtnWide, { marginTop: 0, paddingHorizontal: 10, backgroundColor: "#555" }]}
          >
            <Ionicons name="close-circle-outline" size={14} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {events.length === 0 ? (
        <Text style={[styles.hintText, { marginTop: 12 }]}>
          {total === 0
            ? "Nessun evento stuck-state registrato."
            : "Nessun evento corrisponde al filtro."}
        </Text>
      ) : (
        events.slice(0, 100).map((e) => (
          <View key={e.id} style={styles.row}>
            <Ionicons name="alert-circle-outline" size={14} color="#FF8800" />
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={[styles.rowReason, { fontSize: 11 }]} numberOfLines={1}>
                {e.device_id.substring(0, 16)}…
                {e.runtime_version ? ` · rv${e.runtime_version}` : ""}
              </Text>
              <Text style={styles.rowTime}>
                rollbacks={e.rollback_count} · sessions={e.stuck_sessions} ·{" "}
                {formatTimestamp(e.created_at)}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  hintText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  filterInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    borderWidth: 1,
    borderColor: Colors.border ?? "#333",
  },
  actionBtnWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#444",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#333",
  },
  rowReason: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
  },
  rowTime: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});
