import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface ModeratorLog {
  id: string;
  moderatorId: string;
  moderatorNickname: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetUserNickname: string | null;
  details: string | null;
  createdAt: string;
}

interface ModeratorProfile {
  id: string;
  nickname: string;
}

interface LogsResponse {
  logs: ModeratorLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  moderators: ModeratorProfile[];
  actions: string[];
}

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  view_profile: { icon: "eye-outline", color: Colors.accent },
  create_advertisement: { icon: "plus-circle-outline", color: Colors.success },
  update_advertisement: { icon: "pencil-outline", color: Colors.warning },
  ban_user: { icon: "account-cancel-outline", color: Colors.error },
  unban_user: { icon: "account-check-outline", color: Colors.success },
  approve_photo: { icon: "check-circle-outline", color: Colors.success },
  reject_photo: { icon: "close-circle-outline", color: Colors.error },
};

const webBottomInset = Platform.OS === "web" ? 34 : 0;

function LogRow({ log }: { log: ModeratorLog }) {
  const iconInfo = ACTION_ICONS[log.action] ?? { icon: "information-outline", color: Colors.textSecondary };
  const dateStr = new Date(log.createdAt).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <View style={styles.row}>
      <View style={[styles.iconCircle, { backgroundColor: iconInfo.color + "18" }]}>
        <MaterialCommunityIcons name={iconInfo.icon as "information-outline"} size={20} color={iconInfo.color} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.modName}>{log.moderatorNickname}</Text>
          <Text style={styles.action}>{log.action.replace(/_/g, " ")}</Text>
        </View>
        {log.targetUserNickname ? (
          <Text style={styles.target}>→ {log.targetUserNickname}</Text>
        ) : log.targetId ? (
          <Text style={styles.target}>→ {log.targetType}: {log.targetId.slice(0, 8)}…</Text>
        ) : null}
        {log.details ? (
          <Text style={styles.details} numberOfLines={2}>{log.details}</Text>
        ) : null}
        <Text style={styles.date}>{dateStr}</Text>
      </View>
    </View>
  );
}

export default function AdminModeratorLogs() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [moderatorId, setModeratorId] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [search, setSearch] = useState("");
  const LIMIT = 50;

  const { data, isLoading, isFetching } = useQuery<LogsResponse>({
    queryKey: ["/api/admin/moderator-logs", page, moderatorId, action],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (moderatorId) params.set("moderatorId", moderatorId);
      if (action) params.set("action", action);
      const res = await apiRequest("GET", `/api/admin/moderator-logs?${params.toString()}`);
      return res.json();
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/moderator-logs");
      return res.json() as Promise<{ message: string; deletedCount: number }>;
    },
    onSuccess: (result) => {
      setPage(1);
      setModeratorId("");
      setAction("");
      setSearch("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/moderator-logs"] });
      Alert.alert("Log svuotati", `${result.deletedCount} righe eliminate.`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : t("admin.unknownError");
      Alert.alert("Errore", `Impossibile svuotare i log: ${msg}`);
    },
  });

  function handleClearLogs() {
    if (clearMutation.isPending) return;
    Alert.alert(
      t("admin.clearModLogs"),
      t("admin.clearModLogsConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("admin.clearLogs"), style: "destructive", onPress: () => clearMutation.mutate() },
      ]
    );
  }

  const logs = data?.logs ?? [];
  const totalPages = data?.totalPages ?? 1;
  const moderators = data?.moderators ?? [];
  const actions = data?.actions ?? [];

  const filtered = search.trim()
    ? logs.filter((l) =>
        l.moderatorNickname.toLowerCase().includes(search.toLowerCase()) ||
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        (l.targetUserNickname ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (l.details ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  function handleResetFilters() {
    setModeratorId("");
    setAction("");
    setSearch("");
    setPage(1);
  }

  const hasFilters = !!(moderatorId || action || search);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: webBottomInset }]}>
      <View style={styles.headerRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t("admin.searchPage")}
            placeholderTextColor={Colors.textSecondary}
          />
          {hasFilters && (
            <TouchableOpacity onPress={handleResetFilters}>
              <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.clearBtn, clearMutation.isPending && styles.clearBtnDisabled]}
          onPress={handleClearLogs}
          disabled={clearMutation.isPending}
          testID="clear-moderator-logs-btn"
          accessibilityLabel={t("admin.clearModLogsLabel")}
        >
          {clearMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.error} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
        <Text style={styles.filterLabel}>Moderatore:</Text>
        <TouchableOpacity
          style={[styles.filterChip, !moderatorId && styles.filterChipActive]}
          onPress={() => { setModeratorId(""); setPage(1); }}
        >
          <Text style={[styles.filterChipText, !moderatorId && styles.filterChipTextActive]}>Tutti</Text>
        </TouchableOpacity>
        {moderators.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.filterChip, moderatorId === m.id && styles.filterChipActive]}
            onPress={() => { setModeratorId(m.id); setPage(1); }}
          >
            <Text style={[styles.filterChipText, moderatorId === m.id && styles.filterChipTextActive]}>{m.nickname}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
        <Text style={styles.filterLabel}>Azione:</Text>
        <TouchableOpacity
          style={[styles.filterChip, !action && styles.filterChipActive]}
          onPress={() => { setAction(""); setPage(1); }}
        >
          <Text style={[styles.filterChipText, !action && styles.filterChipTextActive]}>Tutte</Text>
        </TouchableOpacity>
        {actions.map((a) => (
          <TouchableOpacity
            key={a}
            style={[styles.filterChip, action === a && styles.filterChipActive]}
            onPress={() => { setAction(a); setPage(1); }}
          >
            <Text style={[styles.filterChipText, action === a && styles.filterChipTextActive]}>{a.replace(/_/g, " ")}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="shield-account-outline" size={56} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nessun log</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => <LogRow log={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.count}>{data?.total ?? 0} log totali • pagina {page}/{totalPages}</Text>
          }
          ListFooterComponent={
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
              >
                <Ionicons name="chevron-back" size={18} color={page <= 1 ? Colors.border : Colors.accent} />
              </TouchableOpacity>
              <Text style={styles.pageText}>{page} / {totalPages}</Text>
              <TouchableOpacity
                style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isFetching}
              >
                <Ionicons name="chevron-forward" size={18} color={page >= totalPages ? Colors.border : Colors.accent} />
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },
  clearBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.error + "55",
    justifyContent: "center",
    alignItems: "center",
  },
  clearBtnDisabled: { opacity: 0.5 },
  filtersRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  filterLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.accent + "22", borderColor: Colors.accent },
  filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
  filterChipTextActive: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  count: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 8, marginTop: 8 },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  rowContent: { flex: 1, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  modName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  action: { fontSize: 12, color: Colors.accent, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  target: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  details: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  date: { fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    paddingVertical: 16,
  },
  pageBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
});
