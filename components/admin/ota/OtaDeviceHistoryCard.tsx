import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface OtaDiagnosticsView {
  errorCode?: string;
  errorCause?: string;
  errorUserInfo?: string;
  nativeStack?: string;
  updateUrl?: string;
  channel?: string;
  networkInfo?: string;
  probe?: {
    status?: number;
    contentType?: string;
    bodySnippet?: string;
    durationMs?: number;
    error?: string;
  };
}

export interface OtaEventRow {
  id: string;
  created_at: string;
  phase: string;
  source: string | null;
  platform: string | null;
  runtime_version: string | null;
  current_update_id: string | null;
  release_id: string | null;
  error: string | null;
  fail_count: number;
  ip: string | null;
  diagnostics: OtaDiagnosticsView | null;
}

export interface OtaDeviceCurrentState {
  updateId: string | null;
  runtimeVersion: string | null;
  platform: string | null;
  lastSeen: string;
  lastPhase: string;
  lastError: string | null;
}

interface OtaDeviceHistoryCardProps {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onSearch: () => void;
  onClear: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  historyState: {
    events: OtaEventRow[];
    currentState: OtaDeviceCurrentState | null;
    total: number;
    page: number;
    totalPages: number;
    hasMore: boolean;
    deviceId: string;
  } | null;
  isFetching: boolean;
  error: string | null;
  fuzzy: boolean;
  onFuzzyToggle: (v: boolean) => void;
  formatTimestamp: (iso: string) => string;
  updateIdToOtaNum: Map<string, number>;
}

export const OtaDeviceHistoryCard: React.FC<OtaDeviceHistoryCardProps> = ({
  searchInput,
  onSearchInputChange,
  onSearch,
  onClear,
  onRefresh,
  onLoadMore,
  historyState,
  isFetching,
  error,
  fuzzy,
  onFuzzyToggle,
  formatTimestamp,
  updateIdToOtaNum,
}) => {
  const hasResult = historyState !== null;
  const events = historyState?.events ?? [];
  const current = historyState?.currentState;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="search-outline" size={18} color={Colors.accent} />
        <Text style={styles.cardTitle}>Storico OTA per Dispositivo</Text>
        {hasResult && (
          <TouchableOpacity onPress={onRefresh} disabled={isFetching}>
            {isFetching ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Ionicons name="refresh" size={18} color={Colors.accent} />
            )}
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.hintText}>
        Inserisci il Device ID completo (o parziale con fuzzy search) per vedere tutti i tentativi
        di aggiornamento di quel dispositivo.
      </Text>

      <View style={[styles.filterRow, { marginTop: 12 }]}>
        <TextInput
          style={[styles.filterInput, { flex: 1 }]}
          placeholder="Device ID (es. c674...)"
          placeholderTextColor={Colors.textMuted ?? "#888"}
          value={searchInput}
          onChangeText={onSearchInputChange}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={onSearch}
        />
        <TouchableOpacity
          onPress={onSearch}
          disabled={isFetching || !searchInput.trim()}
          style={[styles.actionBtnWide, { marginTop: 0, paddingHorizontal: 12, backgroundColor: Colors.accent }]}
        >
          <Text style={styles.actionBtnText}>Cerca</Text>
        </TouchableOpacity>
        {hasResult && (
          <TouchableOpacity
            onPress={onClear}
            style={[styles.actionBtnWide, { marginTop: 0, paddingHorizontal: 10, backgroundColor: "#555" }]}
          >
            <Ionicons name="close-circle-outline" size={14} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        onPress={() => onFuzzyToggle(!fuzzy)}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}
      >
        <Ionicons
          name={fuzzy ? "checkbox" : "square-outline"}
          size={16}
          color={fuzzy ? Colors.accent : Colors.textMuted}
        />
        <Text style={{ fontSize: 12, color: Colors.textSecondary }}>Ricerca parziale (fuzzy)</Text>
      </TouchableOpacity>

      {error && <Text style={[styles.hintText, { color: "#FF4444", marginTop: 10 }]}>{error}</Text>}

      {hasResult && current && (
        <View style={styles.deviceStatusBox}>
          <Text style={styles.deviceStatusTitle}>Stato Attuale Rilevato</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
            {current.updateId && (
              <View style={[styles.rvBadge, { backgroundColor: Colors.accent + "22" }]}>
                <Text style={[styles.rvText, { color: Colors.accent }]}>
                  {updateIdToOtaNum.has(current.updateId)
                    ? `OTA-${updateIdToOtaNum.get(current.updateId)}`
                    : current.updateId.substring(0, 12) + "…"}
                </Text>
              </View>
            )}
            {current.runtimeVersion && (
              <View style={styles.rvBadge}>
                <Text style={styles.rvText}>rv {current.runtimeVersion}</Text>
              </View>
            )}
            {current.platform && (
              <View style={[styles.rvBadge, { backgroundColor: "rgba(255,255,255,0.07)" }]}>
                <Text style={styles.rvText}>{current.platform}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.hintText, { marginTop: 6, textAlign: "left", fontStyle: "normal" }]}>
            Ultimo: {current.lastPhase}
            {current.lastError ? ` — ${current.lastError}` : ""} · {formatTimestamp(current.lastSeen)}
          </Text>
        </View>
      )}

      {hasResult && current === null && !isFetching && (
        <Text style={[styles.hintText, { marginTop: 12, color: "#FF8888" }]}>
          Nessun evento trovato per questo dispositivo.{fuzzy ? "" : " Prova con la ricerca parziale."}
        </Text>
      )}

      {hasResult && events.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text
            style={{
              color: Colors.textSecondary,
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              marginBottom: 4,
            }}
          >
            Timeline — {events.length} / {historyState!.total} eventi (pag. {historyState!.page}/{historyState!.totalPages})
          </Text>
          {events.map((e) => {
            const isErr = !!e.error && !e.error.startsWith("ok:");
            const color = isErr ? "#FF4444" : "#44AA44";
            const icon: keyof typeof Ionicons.glyphMap = isErr
              ? "alert-circle-outline"
              : "checkmark-circle-outline";
            return (
              <View key={e.id} style={styles.row}>
                <Ionicons name={icon} size={14} color={color} />
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={[styles.rowReason, { fontSize: 11 }]} numberOfLines={2}>
                    {e.phase}
                    {e.source ? ` · ${e.source}` : ""}
                    {e.platform ? ` · ${e.platform}` : ""}
                    {e.error ? ` — ${e.error}` : ""}
                  </Text>
                  <Text style={styles.rowTime}>
                    rv={e.runtime_version ?? "?"} · uid=
                    {(e.current_update_id ?? "?").substring(0, 12)}
                    {e.release_id ? ` · rel=${e.release_id.substring(0, 8)}` : ""}
                    {e.fail_count > 0 ? ` · fail#${e.fail_count}` : ""} ·{" "}
                    {formatTimestamp(e.created_at)}
                  </Text>
                </View>
              </View>
            );
          })}

          {historyState!.hasMore && (
            <TouchableOpacity
              onPress={onLoadMore}
              disabled={isFetching}
              style={[styles.actionBtnWide, { marginTop: 8, backgroundColor: "#333" }]}
            >
              {isFetching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="chevron-down-outline" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>
                    Carica altri ({historyState!.total - events.length} rimanenti)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
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
  actionBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  deviceStatusBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: Colors.border + "22",
  },
  deviceStatusTitle: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  rvBadge: {
    backgroundColor: Colors.textSecondary + "22",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rvText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
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
