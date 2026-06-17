import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiRequest, queryClient, getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { addDiagnosticEventListener, removeDiagnosticEventListener } from "@/lib/diagnostic/ws-client";
import { DiagnosticFilterPanel, EMPTY_FILTERS } from "@/components/admin/DiagnosticFilterPanel";
import { DiagnosticReportCard } from "@/components/admin/DiagnosticReportCard";
import type { Filters } from "@/components/admin/DiagnosticFilterPanel";
import type { DiagReport, RemoteReqStatus } from "@/components/admin/DiagnosticReportCard";

interface OnlineUser { userId: string; role: string }
interface ReportsResponse { reports: DiagReport[]; total: number; page: number; limit: number }

type DiagStatus = "idle" | "pending" | "running" | "done" | "failed";
const statusMap: Record<DiagStatus, string> = {
  idle: "", pending: "⏳ In attesa…", running: "⚙️ In corso…", done: "✅ Completata", failed: "❌ Fallita",
};

function buildReportsUrl(filters: Filters, page: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "20");
  if (filters.nickname) params.set("nickname", filters.nickname);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.appVersion) params.set("appVersion", filters.appVersion);
  if (filters.onlyFailed) params.set("onlyFailed", "true");
  if (filters.onlyRemote) params.set("onlyRemote", "true");
  return `/api/admin/diagnostic-reports?${params.toString()}`;
}

function hasActiveFilters(f: Filters): boolean {
  return !!(f.nickname || f.platform || f.dateFrom || f.dateTo || f.appVersion || f.onlyFailed || f.onlyRemote);
}

export default function DiagnosticReportsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [triggeredStatus, setTriggeredStatus] = useState<Record<string, DiagStatus>>({});
  const [remoteReqStatus, setRemoteReqStatus] = useState<Record<string, { status: RemoteReqStatus; requestedAt: number }>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const reportsUrlRef = useRef<string>("/api/admin/diagnostic-reports");

  useEffect(() => {
    const onProgress = (msg: Record<string, unknown>) => {
      const userId = msg.userId as string | undefined;
      if (userId) setTriggeredStatus(prev => ({ ...prev, [userId]: "running" }));
    };
    const onResult = (msg: Record<string, unknown>) => {
      const userId = msg.userId as string | undefined;
      if (userId) {
        setTriggeredStatus(prev => ({ ...prev, [userId]: "done" }));
        queryClient.invalidateQueries({ queryKey: [reportsUrlRef.current] });
      }
    };
    addDiagnosticEventListener("diag:progress", onProgress);
    addDiagnosticEventListener("diag:result", onResult);
    return () => {
      removeDiagnosticEventListener("diag:progress", onProgress);
      removeDiagnosticEventListener("diag:result", onResult);
    };
  }, []);

  const reportsUrl = buildReportsUrl(filters, page);
  reportsUrlRef.current = reportsUrl;

  const { data: onlineData, isLoading: onlineLoading, isError: onlineError, refetch: refetchOnline } = useQuery<{ users: OnlineUser[] }>({
    queryKey: ["/api/admin/diagnostic-reports/online-users"],
    refetchInterval: 15000,
  });

  const { data: reportsData, isLoading: reportsLoading, isError: reportsError, refetch } = useQuery<ReportsResponse>({
    queryKey: [reportsUrl],
    refetchInterval: 30000,
    select: (data) => data,
  });

  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(userSearchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [userSearchQuery]);

  const { data: searchUsersData, isLoading: searchUsersLoading, isError: searchUsersError } = useQuery<{ users: Array<{ id: string; nickname: string | null }> }>({
    queryKey: ["/api/admin/diagnostic/search-users", debouncedSearch],
    enabled: debouncedSearch.length >= 2,
    queryFn: async () => {
      const url = new URL("/api/admin/diagnostic/search-users", getApiUrl());
      url.searchParams.set("q", debouncedSearch);
      const res = await fetch(url.toString(), { headers: authFetchHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Errore ricerca utenti");
      return res.json() as Promise<{ users: Array<{ id: string; nickname: string | null }> }>;
    },
  });

  useEffect(() => {
    if (!reportsData?.reports) return;
    setRemoteReqStatus(prev => {
      const next = { ...prev };
      let changed = false;
      for (const [userId, req] of Object.entries(next)) {
        if (req.status !== "pending") continue;
        const arrived = reportsData.reports.some(
          r => r.userId === userId && new Date(r.runAt).getTime() > req.requestedAt
        );
        if (arrived) { next[userId] = { ...req, status: "received" }; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [reportsData]);

  const triggerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/diagnostic-reports/trigger/${userId}`, { showBanner: false });
      return await res.json();
    },
    onMutate: (userId) => setTriggeredStatus(prev => ({ ...prev, [userId]: "pending" })),
    onError: (_err, userId) => setTriggeredStatus(prev => ({ ...prev, [userId]: "failed" })),
  });

  const remoteRequestMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", "/api/admin/diagnostic/request", { userId });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Errore");
      return json;
    },
    onMutate: (userId) => setRemoteReqStatus(prev => ({ ...prev, [userId]: { status: "pending", requestedAt: Date.now() } })),
    onError: (_err, userId) => setRemoteReqStatus(prev => ({ ...prev, [userId]: { ...prev[userId], status: "failed" } })),
  });

  const applyFilters = useCallback(() => { setFilters(pendingFilters); setPage(1); setShowFilters(false); }, [pendingFilters]);
  const resetFilters = useCallback(() => { setPendingFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPage(1); setShowFilters(false); }, []);

  const onlineUsers = onlineData?.users ?? [];
  const reports = reportsData?.reports ?? [];
  const totalPages = reportsData ? Math.ceil(reportsData.total / 20) : 1;
  const active = hasActiveFilters(filters);
  const searchResults = searchUsersData?.users ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Diagnostica Remota</Text>
        <TouchableOpacity
          style={[styles.filterToggle, active && styles.filterToggleActive]}
          onPress={() => { setPendingFilters(filters); setShowFilters(v => !v); }}
        >
          <Ionicons name="filter" size={18} color={active ? "#fff" : "#9CA3AF"} />
          {active && <View style={styles.filterDot} />}
        </TouchableOpacity>
      </View>

      {showFilters && (
        <DiagnosticFilterPanel
          pendingFilters={pendingFilters}
          setPendingFilters={setPendingFilters}
          applyFilters={applyFilters}
          resetFilters={resetFilters}
        />
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={onlineLoading || reportsLoading} onRefresh={refetch} />}
      >
        <Text style={styles.sectionLabel}>UTENTI ONLINE (WS)</Text>
        {onlineLoading && <ActivityIndicator style={{ margin: 16 }} />}
        {onlineError && !onlineLoading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Errore caricamento utenti online</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetchOnline()}>
              <Text style={styles.retryBtnText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        )}
        {!onlineLoading && !onlineError && onlineUsers.length === 0 && (
          <Text style={styles.emptyText}>Nessun utente connesso via WS</Text>
        )}
        {onlineUsers.map(({ userId }) => {
          const st: DiagStatus = triggeredStatus[userId] ?? "idle";
          const isPending = st === "pending" || st === "running";
          return (
            <View key={userId} style={styles.userRow}>
              <Ionicons name="ellipse" size={10} color="#22C55E" />
              <Text style={styles.userId} numberOfLines={1}>{userId.slice(0, 8)}…</Text>
              {st !== "idle" && <Text style={styles.statusText}>{statusMap[st]}</Text>}
              <TouchableOpacity style={[styles.triggerBtn, isPending && styles.triggerBtnDisabled]} disabled={isPending} onPress={() => triggerMutation.mutate(userId)}>
                {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.triggerBtnText}>Avvia WS</Text>}
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>RICHIEDI DIAGNOSTICA (POLLING)</Text>
        <Text style={styles.hintText}>L'app dell'utente eseguirà la diagnostica al prossimo polling (~60s)</Text>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            value={userSearchQuery}
            onChangeText={setUserSearchQuery}
            placeholder="Cerca per nickname o ID utente…"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {userSearchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setUserSearchQuery(""); setDebouncedSearch(""); }}>
              <Ionicons name="close-circle" size={16} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
        {searchUsersLoading && <ActivityIndicator style={{ marginVertical: 8 }} />}
        {searchUsersError && !searchUsersLoading && (
          <View style={styles.errorBox}><Text style={styles.errorText}>Errore nella ricerca utenti</Text></View>
        )}
        {debouncedSearch.length >= 2 && !searchUsersLoading && !searchUsersError && searchResults.length === 0 && (
          <Text style={styles.emptyText}>Nessun utente trovato</Text>
        )}
        {debouncedSearch.length < 2 && (
          <Text style={[styles.hintText, { marginTop: 0 }]}>Digita almeno 2 caratteri per cercare</Text>
        )}
        {searchResults.map((u) => {
          const userId = u.id;
          const req = remoteReqStatus[userId];
          const st = req?.status ?? "idle";
          const isPending = st === "pending";
          return (
            <View key={userId} style={styles.userRow}>
              <Text style={styles.userId} numberOfLines={1}>{u.nickname ?? userId.slice(0, 8) + "…"}</Text>
              {st === "pending" && <Text style={styles.statusText}>⏳ In attesa…</Text>}
              {st === "received" && <Text style={[styles.statusText, { color: "#22C55E" }]}>✅ Ricevuto</Text>}
              {st === "failed" && <Text style={[styles.statusText, { color: "#EF4444" }]}>❌ Errore</Text>}
              <TouchableOpacity
                style={[styles.triggerBtn, styles.triggerBtnRemote, (isPending || st === "received") && styles.triggerBtnDisabled]}
                disabled={isPending || st === "received"}
                onPress={() => remoteRequestMutation.mutate(userId)}
              >
                {isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.triggerBtnText}>{st === "received" ? "Inviato" : "Richiedi"}</Text>}
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={styles.divider} />
        <View style={styles.reportsSectionHeader}>
          <Text style={styles.sectionLabel}>REPORT RICEVUTI ({reportsData?.total ?? 0})</Text>
          {active && (
            <View style={styles.activeFilterBadge}>
              <Ionicons name="funnel" size={10} color="#60A5FA" />
              <Text style={styles.activeFilterBadgeText}>Filtri attivi</Text>
            </View>
          )}
        </View>

        {reportsLoading && <ActivityIndicator style={{ margin: 16 }} />}
        {reportsError && !reportsLoading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Errore caricamento report</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryBtnText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        )}
        {!reportsLoading && !reportsError && reports.length === 0 && (
          <Text style={styles.emptyText}>{active ? "Nessun report corrisponde ai filtri" : "Nessun report ancora"}</Text>
        )}
        {reports.map((r) => (
          <DiagnosticReportCard
            key={r.id}
            report={r}
            isExpanded={expandedId === r.id}
            onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
            remoteReqStatus={remoteReqStatus}
            onRequestRemote={(userId) => remoteRequestMutation.mutate(userId)}
          />
        ))}

        {totalPages > 1 && (
          <View style={styles.paginationRow}>
            <TouchableOpacity style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]} disabled={page <= 1} onPress={() => setPage(p => Math.max(1, p - 1))}>
              <Ionicons name="chevron-back" size={16} color={page <= 1 ? "#374151" : "#9CA3AF"} />
            </TouchableOpacity>
            <Text style={styles.pageLabel}>Pagina {page} / {totalPages}</Text>
            <TouchableOpacity style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]} disabled={page >= totalPages} onPress={() => setPage(p => Math.min(totalPages, p + 1))}>
              <Ionicons name="chevron-forward" size={16} color={page >= totalPages ? "#374151" : "#9CA3AF"} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "600", textAlign: "center" },
  filterToggle: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#1C1C1E" },
  filterToggleActive: { backgroundColor: "#3B82F6" },
  filterDot: { position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" },
  sectionLabel: { color: "#6B7280", fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginHorizontal: 16, marginTop: 16, marginBottom: 4, letterSpacing: 0.8 },
  hintText: { color: "#4B5563", fontSize: 11, marginHorizontal: 16, marginBottom: 8 },
  emptyText: { color: "#4B5563", fontSize: 14, textAlign: "center", marginVertical: 8 },
  userRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, backgroundColor: "#1C1C1E", padding: 12, borderRadius: 10, gap: 8 },
  userId: { flex: 1, color: "#D1D5DB", fontSize: 13 },
  statusText: { color: "#9CA3AF", fontSize: 12 },
  triggerBtn: { backgroundColor: "#3B82F6", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, minWidth: 60, alignItems: "center" },
  triggerBtnRemote: { backgroundColor: "#7C3AED" },
  triggerBtnDisabled: { opacity: 0.5 },
  triggerBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  divider: { height: 1, backgroundColor: "#374151", marginHorizontal: 16, marginVertical: 8 },
  reportsSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: 16 },
  activeFilterBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1E3A5F", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  activeFilterBadgeText: { color: "#60A5FA", fontSize: 10, fontWeight: "600" },
  paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, gap: 16 },
  pageBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#1C1C1E", alignItems: "center", justifyContent: "center" },
  pageBtnDisabled: { opacity: 0.4 },
  pageLabel: { color: "#9CA3AF", fontSize: 13 },
  errorBox: { marginHorizontal: 16, marginVertical: 8, backgroundColor: "#1C1C1E", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#374151", alignItems: "center", gap: 8 },
  errorText: { color: "#EF4444", fontSize: 13, textAlign: "center" },
  retryBtn: { backgroundColor: "#1D4ED8", borderRadius: 6, paddingHorizontal: 16, paddingVertical: 6 },
  retryBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  searchRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, backgroundColor: "#1C1C1E", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#374151", gap: 8 },
  searchInput: { flex: 1, color: "#E5E7EB", fontSize: 14 },
});
