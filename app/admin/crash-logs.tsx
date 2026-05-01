import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  TextInput,
  Modal,
  ScrollView,
  Pressable,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";

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
  stackTrace: string | null;
  sessionStartedAt: string | null;
  sessionEndedAt: string | null;
  reportedAt: string;
  nickname: string | null;
}

interface DeviceStat {
  platform: string | null;
  deviceModel: string | null;
  total: number;
}

interface CrashLogsResponse {
  logs: CrashLogRow[];
  total: number;
  page: number;
  limit: number;
  deviceStats: DeviceStat[];
}

const TYPE_FILTERS: { label: string; value: "" | CrashType }[] = [
  { label: "Tutti", value: "" },
  { label: "Sistema", value: "crash_system" },
  { label: "JS Error", value: "crash_js" },
];

const LIMIT = 20;

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function CrashTypeBadge({ type }: { type: CrashType }) {
  const isJs = type === "crash_js";
  const bg = isJs ? "#FF444422" : "#FF6B3522";
  const color = isJs ? "#FF4444" : "#FF6B35";
  return (
    <View style={[badgeStyles.badge, { backgroundColor: bg }]}>
      <MaterialCommunityIcons
        name={isJs ? "code-braces" : "phone-alert"}
        size={12}
        color={color}
      />
      <Text style={[badgeStyles.text, { color }]}>
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
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  );
}

function formatDuration(startIso: string | null, endIso: string | null): string | null {
  if (!startIso) return null;
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : null;
  if (!end) return null;
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return `${min}m ${rem}s`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function classifyLine(line: string): "error" | "app" | "external" {
  if (!line.trimStart().startsWith("at ")) return "error";
  if (line.includes("node_modules") || line.includes("/Libraries/") || line.includes("internal/")) return "external";
  return "app";
}

function StackTraceModal({
  visible,
  item,
  onClose,
}: {
  visible: boolean;
  item: CrashLogRow | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!item) return null;

  const lines = (item.stackTrace ?? "").split("\n");
  const appLineColor = colors.accent ?? "#FF6600";
  const externalColor = colors.textSecondary ?? "#888";
  const errorColor = "#FF4444";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={modalStyles.backdrop} onPress={onClose} />
      <View style={[
        modalStyles.sheet,
        {
          backgroundColor: colors.surface,
          paddingBottom: insets.bottom + 16,
        },
      ]}>
        <View style={[modalStyles.handle, { backgroundColor: colors.border }]} />

        <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
          <View style={modalStyles.headerLeft}>
            <CrashTypeBadge type={item.crashType} />
            <Text style={[modalStyles.headerNick, { color: colors.text }]}>
              {item.nickname ?? item.userId.slice(0, 8)}
            </Text>
            <Text style={[modalStyles.headerDate, { color: externalColor }]}>
              {formatDate(item.reportedAt)}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {item.errorMessage ? (
          <View style={[modalStyles.errorBox, { backgroundColor: "#FF444418" }]}>
            <Text style={[modalStyles.errorText, { color: errorColor, fontFamily: MONO }]} selectable>
              {item.errorMessage}
            </Text>
          </View>
        ) : null}

        {item.stackTrace ? (
          <ScrollView
            style={modalStyles.stackScroll}
            contentContainerStyle={[modalStyles.stackContent, { backgroundColor: colors.background }]}
            showsVerticalScrollIndicator
          >
            <View style={modalStyles.legend}>
              <View style={modalStyles.legendItem}>
                <View style={[modalStyles.legendDot, { backgroundColor: appLineColor }]} />
                <Text style={[modalStyles.legendText, { color: externalColor }]}>App</Text>
              </View>
              <View style={modalStyles.legendItem}>
                <View style={[modalStyles.legendDot, { backgroundColor: externalColor }]} />
                <Text style={[modalStyles.legendText, { color: externalColor }]}>Librerie esterne</Text>
              </View>
            </View>
            {lines.map((line, i) => {
              const kind = classifyLine(line);
              const color =
                kind === "error" ? errorColor :
                kind === "app" ? appLineColor :
                externalColor;
              const weight = kind === "app" ? "600" : "400";
              return (
                <Text
                  key={i}
                  style={[modalStyles.stackLine, { color, fontWeight: weight as "600" | "400" }]}
                  selectable
                >
                  {line || " "}
                </Text>
              );
            })}
          </ScrollView>
        ) : (
          <View style={modalStyles.noStack}>
            <Text style={[modalStyles.noStackText, { color: externalColor }]}>
              Nessuno stack trace disponibile
            </Text>
          </View>
        )}

        {item.sessionId ? (
          <Text style={[modalStyles.sessionId, { color: externalColor }]} selectable>
            Session: {item.sessionId}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerLeft: { gap: 4, flex: 1 },
  headerNick: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  headerDate: { fontFamily: "Inter_400Regular", fontSize: 12 },
  errorBox: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  stackScroll: {
    marginTop: 8,
    marginHorizontal: 12,
    borderRadius: 8,
    flexShrink: 1,
  },
  stackContent: {
    padding: 10,
    borderRadius: 8,
  },
  legend: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 11 },
  stackLine: {
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 18,
  },
  noStack: {
    padding: 24,
    alignItems: "center",
  },
  noStackText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  sessionId: {
    fontFamily: MONO,
    fontSize: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    opacity: 0.6,
  },
});

function CrashLogCard({
  item,
  onOpenStack,
}: {
  item: CrashLogRow;
  onOpenStack: (item: CrashLogRow) => void;
}) {
  const colors = useColors();
  const duration = formatDuration(item.sessionStartedAt, item.sessionEndedAt ?? item.reportedAt);
  const hasStack = !!item.stackTrace;

  return (
    <TouchableOpacity
      style={[cardStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => onOpenStack(item)}
      activeOpacity={0.8}
    >
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <CrashTypeBadge type={item.crashType} />
          <Text style={[cardStyles.nickname, { color: colors.text }]}>
            {item.nickname ?? item.userId.slice(0, 8)}
          </Text>
        </View>
        <View style={cardStyles.headerRight}>
          <Text style={[cardStyles.date, { color: colors.textSecondary }]}>
            {formatDate(item.reportedAt)}
          </Text>
          {hasStack && (
            <View style={[cardStyles.stackBadge, { backgroundColor: (colors.accent ?? "#FF6600") + "22" }]}>
              <MaterialCommunityIcons name="code-braces" size={11} color={colors.accent ?? "#FF6600"} />
              <Text style={[cardStyles.stackBadgeText, { color: colors.accent ?? "#FF6600" }]}>stack</Text>
            </View>
          )}
        </View>
      </View>

      <View style={cardStyles.meta}>
        {item.platform ? (
          <View style={cardStyles.metaItem}>
            <Ionicons name="phone-portrait-outline" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>
              {item.platform}{item.osVersion ? ` ${item.osVersion}` : ""}
            </Text>
          </View>
        ) : null}
        {item.deviceModel ? (
          <View style={cardStyles.metaItem}>
            <MaterialCommunityIcons name="cellphone" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>{item.deviceModel}</Text>
          </View>
        ) : null}
        {item.appVersion ? (
          <View style={cardStyles.metaItem}>
            <MaterialCommunityIcons name="tag-outline" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>v{item.appVersion}</Text>
          </View>
        ) : null}
        {duration ? (
          <View style={cardStyles.metaItem}>
            <Ionicons name="timer-outline" size={12} color={colors.textSecondary} />
            <Text style={[cardStyles.metaText, { color: colors.textSecondary }]}>Sessione {duration}</Text>
          </View>
        ) : null}
      </View>

      {item.errorMessage ? (
        <Text
          style={[cardStyles.errorMessage, { color: "#FF4444", backgroundColor: "#FF444411" }]}
          numberOfLines={2}
        >
          {item.errorMessage}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10, gap: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { gap: 6, flex: 1 },
  headerRight: { alignItems: "flex-end", gap: 4 },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  date: { fontFamily: "Inter_400Regular", fontSize: 12 },
  stackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stackBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  errorMessage: { fontFamily: MONO, fontSize: 12, borderRadius: 6, padding: 8, lineHeight: 18 },
});

export default function CrashLogsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [filterType, setFilterType] = useState<"" | CrashType>("");
  const [filterUser, setFilterUser] = useState("");
  const [filterVersion, setFilterVersion] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCrash, setSelectedCrash] = useState<CrashLogRow | null>(null);

  function buildQueryString() {
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (filterType) p.set("crashType", filterType);
    if (filterUser.trim()) p.set("userId", filterUser.trim());
    if (filterVersion.trim()) p.set("appVersion", filterVersion.trim());
    if (filterDateFrom.trim()) p.set("dateFrom", filterDateFrom.trim());
    if (filterDateTo.trim()) p.set("dateTo", filterDateTo.trim());
    return p.toString();
  }

  const { data, isLoading, isError, refetch } = useQuery<CrashLogsResponse>({
    queryKey: ["/api/admin/crash-logs", filterType, filterUser, filterVersion, filterDateFrom, filterDateTo, page],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/crash-logs?${buildQueryString()}`);
      return res.json() as Promise<CrashLogsResponse>;
    },
    staleTime: 30_000,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const hasActiveFilters = !!(filterUser.trim() || filterVersion.trim() || filterDateFrom.trim() || filterDateTo.trim());

  function resetFilters() {
    setFilterUser("");
    setFilterVersion("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterType("");
    setPage(1);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StackTraceModal
        visible={!!selectedCrash}
        item={selectedCrash}
        onClose={() => setSelectedCrash(null)}
      />

      <View style={[styles.typeBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {TYPE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.typeBtn,
              filterType === f.value && { backgroundColor: colors.accent + "22" },
            ]}
            onPress={() => { setFilterType(f.value); setPage(1); }}
          >
            <Text style={[styles.typeBtnText, { color: filterType === f.value ? colors.accent : colors.textSecondary }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[
            styles.typeBtn,
            showFilters && { backgroundColor: colors.accent + "22" },
            { marginLeft: "auto" },
          ]}
          onPress={() => setShowFilters((v) => !v)}
        >
          <Ionicons
            name={hasActiveFilters ? "filter" : "filter-outline"}
            size={16}
            color={hasActiveFilters ? colors.accent : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={[styles.filtersPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.filterRow}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>User ID</Text>
            <TextInput
              style={[styles.filterInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={filterUser}
              onChangeText={(v) => { setFilterUser(v); setPage(1); }}
              placeholder="es. abc123..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.filterRow}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Versione</Text>
            <TextInput
              style={[styles.filterInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={filterVersion}
              onChangeText={(v) => { setFilterVersion(v); setPage(1); }}
              placeholder="es. 1.2.3"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.filterRow}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Da</Text>
            <TextInput
              style={[styles.filterInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={filterDateFrom}
              onChangeText={(v) => { setFilterDateFrom(v); setPage(1); }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.filterRow}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>A</Text>
            <TextInput
              style={[styles.filterInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={filterDateTo}
              onChangeText={(v) => { setFilterDateTo(v); setPage(1); }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {hasActiveFilters && (
            <TouchableOpacity onPress={resetFilters} style={styles.resetBtn}>
              <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                Azzera filtri
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isLoading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : isError && !data ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Errore caricamento dati</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.accent }]}>
            <Text style={styles.retryBtnText}>Riprova</Text>
          </TouchableOpacity>
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
          renderItem={({ item }) => (
            <CrashLogCard item={item} onOpenStack={setSelectedCrash} />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          ListHeaderComponent={
            <View>
              <Text style={[styles.totalText, { color: colors.textSecondary }]}>
                {total} crash
                {filterType ? ` · ${filterType === "crash_js" ? "JS Error" : "Sistema"}` : ""}
                {filterVersion.trim() ? ` · v${filterVersion.trim()}` : ""}
              </Text>
              {data?.deviceStats && data.deviceStats.length > 0 && (
                <View style={[styles.deviceStatsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.deviceStatsTitle, { color: colors.textSecondary }]}>
                    Top dispositivi
                  </Text>
                  {data.deviceStats.map((stat, i) => {
                    const label = [stat.platform, stat.deviceModel].filter(Boolean).join(" · ") || "Sconosciuto";
                    return (
                      <View key={i} style={styles.deviceStatRow}>
                        <Text style={[styles.deviceStatLabel, { color: colors.text }]} numberOfLines={1}>
                          {label}
                        </Text>
                        <View style={[styles.deviceStatBadge, { backgroundColor: "#FF6B3522" }]}>
                          <Text style={[styles.deviceStatCount, { color: "#FF6B35" }]}>{stat.total}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
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
  container: { flex: 1 },
  typeBar: {
    flexDirection: "row",
    gap: 4,
    padding: 10,
    borderBottomWidth: 1,
    alignItems: "center",
    ...(Platform.OS === "web" ? { paddingTop: 10 } : {}),
  },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  typeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  filtersPanel: {
    borderBottomWidth: 1,
    padding: 12,
    gap: 10,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    width: 60,
  },
  filterInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  resetBtn: {
    alignSelf: "flex-end",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 15, textAlign: "center" },
  retryBtn: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  totalText: { fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 12, marginTop: 4 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 16 },
  pageBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pageText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  deviceStatsContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  deviceStatsTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  deviceStatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  deviceStatLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    flex: 1,
  },
  deviceStatBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deviceStatCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
});
