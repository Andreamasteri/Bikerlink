import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type CrashType = "crash_system" | "crash_js";

interface CrashLogRow {
  id: string;
  userId: string;
  sessionId: string;
  crashType: CrashType;
  appVersion: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  errorMessage: string | null;
  sessionStartedAt: string | null;
  sessionEndedAt: string | null;
  reportedAt: string;
  nickname: string | null;
  avatarUrl: string | null;
}

interface CrashLogsResponse {
  logs: CrashLogRow[];
  total: number;
  page: number;
  limit: number;
}

const FILTERS: { label: string; value: "" | CrashType }[] = [
  { label: "Tutti", value: "" },
  { label: "Sistema", value: "crash_system" },
  { label: "JS Error", value: "crash_js" },
];

function CrashTypeBadge({ type }: { type: CrashType }) {
  const colors = useColors();
  const isJs = type === "crash_js";
  return (
    <View
      style={[
        badgeStyles.badge,
        { backgroundColor: isJs ? "#FF4444" + "22" : "#FF6B35" + "22" },
      ]}
    >
      <MaterialCommunityIcons
        name={isJs ? "code-braces" : "phone-alert"}
        size={12}
        color={isJs ? "#FF4444" : "#FF6B35"}
      />
      <Text style={[badgeStyles.text, { color: isJs ? "#FF4444" : "#FF6B35" }]}>
        {isJs ? "JS Error" : "Sistema"}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

function CrashLogCard({ item }: { item: CrashLogRow }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={[cardStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <CrashTypeBadge type={item.crashType} />
          <Text style={[cardStyles.nickname, { color: colors.text }]}>
            {item.nickname ?? item.userId.slice(0, 8)}
          </Text>
        </View>
        <Text style={[cardStyles.date, { color: colors.textSecondary }]}>
          {formatDate(item.reportedAt)}
        </Text>
      </View>

      <View style={cardStyles.meta}>
        {item.platform && (
          <View style={cardStyles.metaItem}>
            <Ionicons name="phone-portrait-outline" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>
              {item.platform}
              {item.osVersion ? ` ${item.osVersion}` : ""}
            </Text>
          </View>
        )}
        {item.deviceModel && (
          <View style={cardStyles.metaItem}>
            <MaterialCommunityIcons name="cellphone" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>{item.deviceModel}</Text>
          </View>
        )}
        {item.appVersion && (
          <View style={cardStyles.metaItem}>
            <MaterialCommunityIcons name="tag-outline" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>v{item.appVersion}</Text>
          </View>
        )}
      </View>

      {item.errorMessage && (
        <Text
          style={[cardStyles.errorMessage, { color: "#FF4444", backgroundColor: "#FF444411" }]}
          numberOfLines={expanded ? undefined : 2}
        >
          {item.errorMessage}
        </Text>
      )}

      {expanded && item.sessionStartedAt && (
        <Text style={[cardStyles.sessionInfo, { color: colors.textSecondary }]}>
          Sessione iniziata: {formatDate(item.sessionStartedAt)}
        </Text>
      )}

      {expanded && item.sessionId && (
        <Text style={[cardStyles.sessionInfo, { color: colors.textSecondary }]}>
          Session ID: {item.sessionId}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: {
    gap: 6,
  },
  nickname: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  date: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  errorMessage: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    borderRadius: 6,
    padding: 8,
    lineHeight: 18,
  },
  sessionInfo: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});

export default function CrashLogsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filterType, setFilterType] = useState<"" | CrashType>("");
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  function buildQueryString() {
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (filterType) params.set("crashType", filterType);
    return params.toString();
  }

  const { data: fetchedData, isLoading, isError } = useQuery<CrashLogsResponse>({
    queryKey: ["/api/crash-logs/admin", filterType, page],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const res = await fetch(
        new URL(`/api/crash-logs/admin?${buildQueryString()}`, getApiUrl()).toString(),
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Errore fetch");
      return res.json();
    },
    staleTime: 30_000,
  });

  const logs = fetchedData?.logs ?? [];
  const total = fetchedData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.filterBar,
          { backgroundColor: colors.surface, borderColor: colors.border },
          Platform.OS === "web" && { marginTop: 0 },
        ]}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.filterBtn,
              filterType === f.value && { backgroundColor: colors.accent + "22" },
            ]}
            onPress={() => {
              setFilterType(f.value);
              setPage(1);
            }}
          >
            <Text
              style={[
                styles.filterBtnText,
                { color: filterType === f.value ? colors.accent : colors.textSecondary },
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && !fetchedData ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : isError && !fetchedData ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Errore caricamento dati</Text>
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="check-circle-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nessun crash registrato</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CrashLogCard item={item} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 20, paddingTop: Platform.OS === "web" ? 8 : 8 },
          ]}
          ListHeaderComponent={
            <Text style={[styles.totalText, { color: colors.textSecondary }]}>
              {total} crash {filterType ? `(${filterType === "crash_js" ? "JS Error" : "Sistema"})` : "totali"}
            </Text>
          }
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: page <= 1 ? 0.4 : 1 }]}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.pageText, { color: colors.textSecondary }]}>
                  {page} / {totalPages}
                </Text>
                <TouchableOpacity
                  style={[styles.pageBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: page >= totalPages ? 0.4 : 1 }]}
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <Ionicons name="chevron-forward" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterBar: {
    flexDirection: "row",
    gap: 6,
    padding: 12,
    borderBottomWidth: 1,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  filterBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlign: "center",
  },
  list: {
    paddingHorizontal: 16,
  },
  totalText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginBottom: 12,
    marginTop: 4,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingTop: 16,
  },
  pageBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pageText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
});
