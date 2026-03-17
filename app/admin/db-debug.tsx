import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface RecentRecord {
  id: string;
  createdAt?: string | null;
  label?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
  conversationType?: string | null;
  messageType?: string | null;
  clubType?: string | null;
  isApproved?: boolean | null;
  clubId?: string | null;
  isActive?: boolean | null;
  userId?: string | null;
  model?: string | null;
  easterEggId?: string | null;
  targetType?: string | null;
  notificationType?: string | null;
  ticketType?: string | null;
}

interface TableStat {
  name: string;
  label: string;
  total: number;
  recent: RecentRecord[];
}

interface DbStats {
  tables: TableStat[];
}

function formatDateIT(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRecordLabel(record: RecentRecord): string {
  if (record.label != null && record.label !== "") return record.label;
  if (record.email != null && record.email !== "") return record.email;
  return record.id.slice(0, 8);
}

function getRecordSub(record: RecentRecord): string {
  const parts: string[] = [];
  if (record.email != null) parts.push(`email: ${record.email}`);
  if (record.role != null) parts.push(`role: ${record.role}`);
  if (record.status != null) parts.push(`status: ${record.status}`);
  if (record.conversationType != null) parts.push(`type: ${record.conversationType}`);
  if (record.messageType != null) parts.push(`type: ${record.messageType}`);
  if (record.clubType != null) parts.push(`tipo: ${record.clubType}`);
  if (record.isApproved != null) parts.push(`approvato: ${record.isApproved ? "sì" : "no"}`);
  if (record.isActive != null) parts.push(`attivo: ${record.isActive ? "sì" : "no"}`);
  if (record.model != null) parts.push(`modello: ${record.model}`);
  if (record.targetType != null) parts.push(`target: ${record.targetType}`);
  if (record.notificationType != null) parts.push(`tipo: ${record.notificationType}`);
  if (record.ticketType != null) parts.push(`tipo: ${record.ticketType}`);
  return parts.slice(0, 3).join(" · ");
}

function TableCard({ table }: { table: TableStat }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.7}
      >
        <View style={styles.cardTitleRow}>
          <MaterialCommunityIcons name="table" size={18} color={Colors.accent} />
          <Text style={styles.cardTitle}>{table.label}</Text>
          <Text style={styles.cardName}>({table.name})</Text>
        </View>
        <View style={styles.cardRight}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{table.total.toLocaleString("it-IT")}</Text>
          </View>
          <MaterialIcons
            name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
            size={22}
            color={Colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.recentList}>
          {table.recent.length === 0 ? (
            <Text style={styles.emptyText}>Nessun record</Text>
          ) : (
            table.recent.map((rec) => (
              <View key={rec.id} style={styles.recordRow}>
                <View style={styles.recordInfo}>
                  <View style={styles.recordTopRow}>
                    <Text style={styles.recordId} numberOfLines={1}>
                      {rec.id.slice(0, 8)}…
                    </Text>
                    <Text style={styles.recordDate}>{formatDateIT(rec.createdAt)}</Text>
                  </View>
                  <Text style={styles.recordLabel} numberOfLines={1}>
                    {getRecordLabel(rec)}
                  </Text>
                  {getRecordSub(rec) ? (
                    <Text style={styles.recordSub} numberOfLines={1}>
                      {getRecordSub(rec)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

export default function AdminDbDebug() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery<DbStats>({
    queryKey: ["/api/admin/db-stats"],
    refetchInterval: 10000,
  });

  const totalRecords = data?.tables.reduce((acc, t) => acc + t.total, 0) ?? 0;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={
        <RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => refetch()} tintColor={Colors.accent} />
      }
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.subtitle}>
            {data ? `${data.tables.length} tabelle · ${totalRecords.toLocaleString("it-IT")} record totali` : "Caricamento..."}
          </Text>
          {lastUpdated && (
            <Text style={styles.lastUpdated}>
              Aggiornato: {lastUpdated.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, isFetching && styles.refreshBtnDisabled]}
          onPress={() => refetch()}
          disabled={isFetching}
          activeOpacity={0.7}
        >
          {isFetching ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <MaterialIcons name="refresh" size={22} color={Colors.accent} />
          )}
          <Text style={styles.refreshBtnText}>Aggiorna ora</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Caricamento statistiche DB...</Text>
        </View>
      ) : isError ? (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={40} color={Colors.error} />
          <Text style={styles.errorText}>Errore nel caricamento dei dati</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      ) : (
        data?.tables.map((table) => <TableCard key={table.name} table={table} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  lastUpdated: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  refreshBtnDisabled: {
    opacity: 0.6,
  },
  refreshBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.accent,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorContainer: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.error,
  },
  retryBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  cardName: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countBadge: {
    backgroundColor: Colors.accent + "22",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.accent + "44",
  },
  countText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.accent,
  },
  recentList: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 4,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 12,
  },
  recordRow: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  recordInfo: {
    flex: 1,
  },
  recordTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  recordId: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  recordLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  recordSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  recordDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
});
