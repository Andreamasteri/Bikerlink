// Task #4927 — Storico azioni admin eseguite dall'assistente AI (Bowie).
// Pannello collassabile che legge ai_assistant_telemetry filtrato per platform="admin"
// e event_type IN (action_proposed, action_executed, action_rejected).
import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";

interface ActionHistoryRow {
  id: string;
  eventType: string;
  userId: string | null;
  actionId: string | null;
  params: Record<string, unknown> | null;
  ok: boolean | null;
  summary: string | null;
  createdAt: string;
}

const ACCENT = "#6A1B9A";

function eventIcon(eventType: string, ok: boolean | null): { name: React.ComponentProps<typeof MaterialIcons>["name"]; color: string } {
  if (eventType === "action_rejected") return { name: "block", color: Colors.textSecondary };
  if (eventType === "action_proposed") return { name: "bolt", color: ACCENT };
  if (ok === false) return { name: "error-outline", color: "#C62828" };
  if (ok === true) return { name: "check-circle", color: "#2E7D32" };
  return { name: "bolt", color: ACCENT };
}

function eventLabel(eventType: string, ok: boolean | null): string {
  if (eventType === "action_proposed") return "Proposta";
  if (eventType === "action_rejected") return "Annullata";
  if (eventType === "action_executed") return ok === false ? "Fallita" : "Eseguita";
  return eventType;
}

function eventChipStyle(eventType: string, ok: boolean | null): { bg: string; fg: string } {
  if (eventType === "action_rejected") return { bg: Colors.border, fg: Colors.textSecondary };
  if (eventType === "action_proposed") return { bg: ACCENT + "22", fg: ACCENT };
  if (ok === false) return { bg: "#FFEBEE", fg: "#C62828" };
  return { bg: "#E8F5E9", fg: "#2E7D32" };
}

function paramsPreview(params: Record<string, unknown> | null): string {
  if (!params) return "";
  const entries = Object.entries(params).slice(0, 3);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function actionLabel(actionId: string | null): string {
  if (!actionId) return "—";
  return actionId
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function HistoryRow({ row }: { row: ActionHistoryRow }) {
  const { name: iconName, color: iconColor } = eventIcon(row.eventType, row.ok);
  const label = eventLabel(row.eventType, row.ok);
  const chip = eventChipStyle(row.eventType, row.ok);
  const preview = paramsPreview(row.params);
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <MaterialIcons name={iconName} size={18} color={iconColor} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowAction} numberOfLines={1}>{actionLabel(row.actionId)}</Text>
          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
            <Text style={[styles.chipText, { color: chip.fg }]}>{label}</Text>
          </View>
        </View>
        {preview ? (
          <Text style={styles.rowParams} numberOfLines={2}>{preview}</Text>
        ) : null}
        {row.summary ? (
          <Text style={styles.rowSummary} numberOfLines={2}>{row.summary}</Text>
        ) : null}
        <View style={styles.rowMeta}>
          {row.userId ? (
            <Text style={styles.rowUserId} numberOfLines={1}>
              {row.userId.slice(0, 8)}…
            </Text>
          ) : null}
          <Text style={styles.rowTime}>{formatTime(row.createdAt)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function AdminActionHistory() {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<{ rows: ActionHistoryRow[] }>({
    queryKey: ["/api/admin/ai/assistant/action-history"],
    enabled: expanded,
    staleTime: 60_000,
  });

  const rows = Array.isArray(data?.rows) ? data.rows : [];

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        testID="admin-action-history-toggle"
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconBadge}>
            <MaterialIcons name="history" size={16} color="#fff" />
          </View>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>Storico azioni Bowie</Text>
            <Text style={styles.headerSub}>Ultime azioni admin eseguite dall&apos;assistente</Text>
          </View>
        </View>
        <MaterialIcons
          name={expanded ? "expand-less" : "expand-more"}
          size={24}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={ACCENT} size="small" />
              <Text style={styles.loadingText}>Caricamento...</Text>
            </View>
          ) : isError ? (
            <View style={styles.center}>
              <MaterialIcons name="error-outline" size={22} color={Colors.error} />
              <Text style={styles.errorText}>Errore caricamento</Text>
              <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
                <Text style={styles.retryText}>Riprova</Text>
              </TouchableOpacity>
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.center}>
              <MaterialIcons name="history" size={28} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessuna azione registrata</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              scrollEnabled={rows.length > 4}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {rows.map((row) => (
                <HistoryRow key={row.id} row={row} />
              ))}
            </ScrollView>
          )}
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => refetch()}
            disabled={isLoading}
            testID="admin-action-history-refresh"
          >
            <MaterialIcons name="refresh" size={15} color={Colors.textSecondary} />
            <Text style={styles.refreshText}>Aggiorna</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconBadge: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: ACCENT,
    alignItems: "center", justifyContent: "center",
  },
  headerTextBox: { flex: 1 },
  headerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  body: {
    paddingHorizontal: 14, paddingBottom: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  center: { alignItems: "center", gap: 8, paddingVertical: 20 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.error },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, backgroundColor: ACCENT + "22", marginTop: 4 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: ACCENT },
  list: { maxHeight: 360, marginTop: 10 },
  row: {
    flexDirection: "row", gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border + "88",
  },
  rowLeft: { paddingTop: 2 },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowAction: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  chip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  rowParams: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  rowSummary: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text, lineHeight: 16 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  rowUserId: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, fontStyle: "italic" },
  rowTime: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  refreshBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 8, marginTop: 4,
  },
  refreshText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
});
