import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

interface BootEntry {
  ts: number;
  elapsed_ms: number;
  phase: string;
  msg: string;
  ok: boolean | null;
}

interface BootSummary {
  complete: boolean;
  hasError: boolean;
  totalEntries: number;
  startTs: number | null;
  lastTs: number | null;
  totalElapsedMs: number | null;
}

interface BootLogResponse {
  summary: BootSummary;
  entries: BootEntry[];
}

function statusIcon(ok: boolean | null): string {
  if (ok === true) return "✅";
  if (ok === false) return "❌";
  return "⏳";
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function BootLogScreen() {
  const colors = useColors();
  const s = styles(colors);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<BootLogResponse>({
    queryKey: ["/api/admin/boot-log"],
    refetchInterval: 10_000,
  });

  const renderItem = useCallback(
    ({ item, index }: { item: BootEntry; index: number }) => (
      <View style={[s.row, index % 2 === 0 ? s.rowEven : s.rowOdd]}>
        <Text style={s.icon}>{statusIcon(item.ok)}</Text>
        <View style={s.rowBody}>
          <View style={s.rowHeader}>
            <Text style={s.phase}>{item.phase}</Text>
            <Text style={s.elapsed}>+{formatMs(item.elapsed_ms)}</Text>
          </View>
          <Text style={s.msg}>{item.msg}</Text>
        </View>
        <Text style={s.time}>{formatTime(item.ts)}</Text>
      </View>
    ),
    [s],
  );

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Errore nel caricamento del boot log</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => void refetch()}>
          <Text style={s.retryText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { summary, entries } = data;

  return (
    <View style={s.container}>
      <View style={[s.summaryCard, summary.hasError ? s.summaryError : summary.complete ? s.summaryOk : s.summaryPending]}>
        <Text style={s.summaryTitle}>
          {summary.hasError ? "❌ Boot con errori" : summary.complete ? "✅ Boot completato" : "⏳ Boot in corso"}
        </Text>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Durata totale</Text>
          <Text style={s.summaryValue}>
            {summary.totalElapsedMs != null ? formatMs(summary.totalElapsedMs) : "—"}
          </Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Step registrati</Text>
          <Text style={s.summaryValue}>{summary.totalEntries}</Text>
        </View>
        {summary.startTs && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Avviato alle</Text>
            <Text style={s.summaryValue}>{formatTime(summary.startTs)}</Text>
          </View>
        )}
      </View>

      <View style={s.listHeader}>
        <Text style={s.listTitle}>Log passo per passo</Text>
        <TouchableOpacity onPress={() => void refetch()} disabled={isFetching}>
          <Text style={[s.refreshBtn, isFetching && s.refreshDisabled]}>
            {isFetching ? "..." : "↻ Aggiorna"}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries as BootEntry[]}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    errorText: { color: colors.error ?? "#e55", fontSize: 14 },
    retryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: colors.accent,
      borderRadius: 8,
    },
    retryText: { color: "#fff", fontFamily: "Inter_600SemiBold" },

    summaryCard: {
      margin: 16,
      padding: 16,
      borderRadius: 12,
      gap: 6,
    },
    summaryOk: { backgroundColor: "#1a3a1a" },
    summaryError: { backgroundColor: "#3a1a1a" },
    summaryPending: { backgroundColor: colors.surface },
    summaryTitle: {
      color: colors.text,
      fontFamily: "Inter_700Bold",
      fontSize: 15,
      marginBottom: 4,
    },
    summaryRow: { flexDirection: "row", justifyContent: "space-between" },
    summaryLabel: { color: colors.textSecondary ?? colors.text, fontSize: 13 },
    summaryValue: { color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13 },

    listHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    listTitle: { color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
    refreshBtn: { color: colors.accent, fontSize: 14, fontFamily: "Inter_500Medium" },
    refreshDisabled: { opacity: 0.4 },

    list: { paddingHorizontal: 12, paddingBottom: 32 },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      padding: 10,
      borderRadius: 8,
      gap: 8,
      marginBottom: 2,
    },
    rowEven: { backgroundColor: colors.surface },
    rowOdd: { backgroundColor: colors.background },
    icon: { fontSize: 14, marginTop: 1, width: 20 },
    rowBody: { flex: 1, gap: 2 },
    rowHeader: { flexDirection: "row", justifyContent: "space-between" },
    phase: {
      color: colors.accent,
      fontFamily: "Inter_600SemiBold",
      fontSize: 12,
    },
    elapsed: {
      color: colors.textSecondary ?? colors.text,
      fontSize: 11,
      opacity: 0.7,
    },
    msg: { color: colors.text, fontSize: 13, lineHeight: 18 },
    time: {
      color: colors.textSecondary ?? colors.text,
      fontSize: 10,
      opacity: 0.6,
      marginTop: 2,
      minWidth: 50,
      textAlign: "right",
    },
  });
