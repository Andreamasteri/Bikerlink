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
import type { DiagnosticSummary, DiagnosticTestResult } from "@/lib/diagnostic/runner";

interface OnlineUser { userId: string; role: string }
interface DiagReport {
  id: string; userId?: string; nickname?: string; triggeredBy: string;
  appVersion?: string; platform?: string; deviceModel?: string;
  runAt: string; sentryEventId?: string; summary?: DiagnosticSummary;
  results?: DiagnosticTestResult[];
}
interface ReportsResponse { reports: DiagReport[]; total: number; page: number; limit: number }

type DiagStatus = "idle" | "pending" | "running" | "done" | "failed";
const statusMap: Record<DiagStatus, string> = {
  idle: "", pending: "⏳ In attesa…", running: "⚙️ In corso…", done: "✅ Completata", failed: "❌ Fallita",
};

type RemoteReqStatus = "idle" | "pending" | "received" | "failed";

const STATUS_COLOR: Record<string, string> = { PASS: "#22C55E", FAIL: "#EF4444", WARN: "#F59E0B", SKIP: "#6B7280" };
const PLATFORMS = ["", "ios", "android", "web"] as const;
const PLATFORM_LABELS: Record<string, string> = { "": "Tutti", ios: "iOS", android: "Android", web: "Web" };

interface Filters {
  nickname: string;
  userId: string;
  platform: string;
  dateFrom: string;
  dateTo: string;
  appVersion: string;
  onlyFailed: boolean;
  onlyRemote: boolean;
}

const EMPTY_FILTERS: Filters = {
  nickname: "",
  userId: "",
  platform: "",
  dateFrom: "",
  dateTo: "",
  appVersion: "",
  onlyFailed: false,
  onlyRemote: false,
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

  // Subscribe to admin events via the shared ws-client instead of opening a second WS.
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

  // User search for the POLLING section
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
        if (arrived) {
          next[userId] = { ...req, status: "received" };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [reportsData]);

  const triggerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/diagnostic-reports/trigger/${userId}`, { showBanner: false });
      return await res.json();
    },
    onMutate: (userId) => {
      setTriggeredStatus(prev => ({ ...prev, [userId]: "pending" }));
    },
    onError: (_err, userId) => {
      setTriggeredStatus(prev => ({ ...prev, [userId]: "failed" }));
    },
  });

  const remoteRequestMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", "/api/admin/diagnostic/request", { userId });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Errore");
      return json;
    },
    onMutate: (userId) => {
      setRemoteReqStatus(prev => ({ ...prev, [userId]: { status: "pending", requestedAt: Date.now() } }));
    },
    onError: (_err, userId) => {
      setRemoteReqStatus(prev => ({ ...prev, [userId]: { ...prev[userId], status: "failed" } }));
    },
  });

  const applyFilters = useCallback(() => {
    setFilters(pendingFilters);
    setPage(1);
    setShowFilters(false);
  }, [pendingFilters]);

  const resetFilters = useCallback(() => {
    setPendingFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
    setShowFilters(false);
  }, []);

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
          onPress={() => {
            setPendingFilters(filters);
            setShowFilters(v => !v);
          }}
        >
          <Ionicons name="filter" size={18} color={active ? "#fff" : "#9CA3AF"} />
          {active && <View style={styles.filterDot} />}
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterPanelTitle}>FILTRI</Text>

          <Text style={styles.filterLabel}>Nickname utente</Text>
          <TextInput
            style={styles.filterInput}
            value={pendingFilters.nickname}
            onChangeText={(v) => setPendingFilters(p => ({ ...p, nickname: v }))}
            placeholder="Cerca per nickname…"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.filterLabel}>User ID (esatto)</Text>
          <TextInput
            style={styles.filterInput}
            value={pendingFilters.userId}
            onChangeText={(v) => setPendingFilters(p => ({ ...p, userId: v.trim() }))}
            placeholder="es. a1b2c3d4-…"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.filterLabel}>Piattaforma</Text>
          <View style={styles.platformRow}>
            {PLATFORMS.map((p) => (
              <TouchableOpacity
                key={p || "all"}
                style={[styles.platformBtn, pendingFilters.platform === p && styles.platformBtnActive]}
                onPress={() => setPendingFilters(prev => ({ ...prev, platform: p }))}
              >
                <Text style={[styles.platformBtnText, pendingFilters.platform === p && styles.platformBtnTextActive]}>
                  {PLATFORM_LABELS[p]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>Dal (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.filterInput}
                value={pendingFilters.dateFrom}
                onChangeText={(v) => setPendingFilters(p => ({ ...p, dateFrom: v }))}
                placeholder="2025-01-01"
                placeholderTextColor="#4B5563"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ width: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>Al (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.filterInput}
                value={pendingFilters.dateTo}
                onChangeText={(v) => setPendingFilters(p => ({ ...p, dateTo: v }))}
                placeholder="2025-12-31"
                placeholderTextColor="#4B5563"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <Text style={styles.filterLabel}>Versione app</Text>
          <TextInput
            style={styles.filterInput}
            value={pendingFilters.appVersion}
            onChangeText={(v) => setPendingFilters(p => ({ ...p, appVersion: v }))}
            placeholder="es. 1.2.3"
            placeholderTextColor="#4B5563"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, pendingFilters.onlyFailed && styles.toggleBtnActive]}
              onPress={() => setPendingFilters(p => ({ ...p, onlyFailed: !p.onlyFailed }))}
            >
              <Ionicons name={pendingFilters.onlyFailed ? "checkbox" : "square-outline"} size={16} color={pendingFilters.onlyFailed ? "#EF4444" : "#6B7280"} />
              <Text style={[styles.toggleBtnText, pendingFilters.onlyFailed && { color: "#EF4444" }]}>Solo con FAIL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, pendingFilters.onlyRemote && styles.toggleBtnActive]}
              onPress={() => setPendingFilters(p => ({ ...p, onlyRemote: !p.onlyRemote }))}
            >
              <Ionicons name={pendingFilters.onlyRemote ? "checkbox" : "square-outline"} size={16} color={pendingFilters.onlyRemote ? "#7C3AED" : "#6B7280"} />
              <Text style={[styles.toggleBtnText, pendingFilters.onlyRemote && { color: "#A78BFA" }]}>Solo REMOTI</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterActions}>
            <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
              <Text style={styles.resetBtnText}>Azzera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
              <Text style={styles.applyBtnText}>Applica filtri</Text>
            </TouchableOpacity>
          </View>
        </View>
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
              <TouchableOpacity
                style={[styles.triggerBtn, isPending && styles.triggerBtnDisabled]}
                disabled={isPending}
                onPress={() => triggerMutation.mutate(userId)}
              >
                {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.triggerBtnText}>Avvia WS</Text>}
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>RICHIEDI DIAGNOSTICA (POLLING)</Text>
        <Text style={styles.hintText}>L'app dell'utente eseguirà la diagnostica al prossimo polling (~60s)</Text>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="#6B7280" style={styles.searchIcon} />
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
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Errore nella ricerca utenti</Text>
          </View>
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
              <Text style={styles.userId} numberOfLines={1}>
                {u.nickname ?? userId.slice(0, 8) + "…"}
              </Text>
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
                  : <Text style={styles.triggerBtnText}>{st === "received" ? "Inviato" : "Richiedi"}</Text>
                }
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
          <Text style={styles.emptyText}>
            {active ? "Nessun report corrisponde ai filtri" : "Nessun report ancora"}
          </Text>
        )}
        {reports.map((r) => {
          const isExpanded = expandedId === r.id;
          const failed = r.summary?.failed ?? 0;
          const warned = r.summary?.warned ?? 0;
          const passed = r.summary?.passed ?? 0;
          const isRemote = r.triggeredBy === "remote";
          return (
            <TouchableOpacity
              key={r.id}
              style={styles.reportCard}
              onPress={() => setExpandedId(isExpanded ? null : r.id)}
              activeOpacity={0.8}
            >
              <View style={styles.reportCardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.reportTitleRow}>
                    <Text style={styles.reportNickname}>{r.nickname ?? r.userId?.slice(0, 8) ?? "—"}</Text>
                    {isRemote && (
                      <View style={styles.remoteBadge}>
                        <Text style={styles.remoteBadgeText}>REMOTO</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.reportMeta}>{r.appVersion ?? "?"} · {r.platform ?? "?"} · {r.triggeredBy}</Text>
                  <Text style={styles.reportDate}>{new Date(r.runAt).toLocaleString("it-IT")}</Text>
                </View>
                <View style={styles.reportBadges}>
                  {failed > 0 && <Text style={[styles.badgeCount, { color: "#EF4444" }]}>{failed}F</Text>}
                  {warned > 0 && <Text style={[styles.badgeCount, { color: "#F59E0B" }]}>{warned}W</Text>}
                  <Text style={[styles.badgeCount, { color: "#22C55E" }]}>{passed}P</Text>
                  <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
                </View>
              </View>

              {isExpanded && (
                <View style={styles.reportDetail}>
                  {r.userId && (
                    <TouchableOpacity
                      style={styles.requestInlineBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        if (r.userId) remoteRequestMutation.mutate(r.userId);
                      }}
                      disabled={remoteReqStatus[r.userId ?? ""]?.status === "pending"}
                    >
                      <Ionicons name="refresh-outline" size={13} color="#60A5FA" />
                      <Text style={styles.requestInlineBtnText}>Richiedi nuova diagnostica</Text>
                    </TouchableOpacity>
                  )}
                  {r.sentryEventId && (
                    <Text style={styles.sentryId}>Sentry: {r.sentryEventId}</Text>
                  )}
                  {r.summary && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryItem}>✅ {r.summary.passed}P</Text>
                      <Text style={[styles.summaryItem, { color: "#EF4444" }]}>❌ {r.summary.failed}F</Text>
                      <Text style={[styles.summaryItem, { color: "#F59E0B" }]}>⚠️ {r.summary.warned}W</Text>
                      <Text style={[styles.summaryItem, { color: "#6B7280" }]}>⏭ {r.summary.skipped}S</Text>
                      <Text style={[styles.summaryItem, { color: "#9CA3AF" }]}>{r.summary.durationMs}ms</Text>
                    </View>
                  )}
                  {(r.results ?? []).map((res, i) => (
                    <View key={i} style={styles.testRow}>
                      <View style={[styles.dot, { backgroundColor: STATUS_COLOR[res.status] ?? "#6B7280" }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.testName} numberOfLines={1}>{res.section} · {res.name}</Text>
                        {res.message ? <Text style={styles.testMessage} numberOfLines={3}>{res.message}</Text> : null}
                      </View>
                      <Text style={[styles.testStatus, { color: STATUS_COLOR[res.status] ?? "#6B7280" }]}>{res.status}</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {totalPages > 1 && (
          <View style={styles.paginationRow}>
            <TouchableOpacity
              style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
              disabled={page <= 1}
              onPress={() => setPage(p => Math.max(1, p - 1))}
            >
              <Ionicons name="chevron-back" size={16} color={page <= 1 ? "#374151" : "#9CA3AF"} />
            </TouchableOpacity>
            <Text style={styles.pageLabel}>Pagina {page} / {totalPages}</Text>
            <TouchableOpacity
              style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
              disabled={page >= totalPages}
              onPress={() => setPage(p => Math.min(totalPages, p + 1))}
            >
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

  filterPanel: { backgroundColor: "#111827", marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#1F2937" },
  filterPanelTitle: { color: "#6B7280", fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  filterLabel: { color: "#9CA3AF", fontSize: 11, fontWeight: "600", marginBottom: 4, marginTop: 8 },
  filterInput: { backgroundColor: "#1C1C1E", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: "#E5E7EB", fontSize: 14, borderWidth: 1, borderColor: "#374151" },
  platformRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  platformBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: "#1C1C1E", borderWidth: 1, borderColor: "#374151" },
  platformBtnActive: { backgroundColor: "#1D4ED8", borderColor: "#3B82F6" },
  platformBtnText: { color: "#9CA3AF", fontSize: 13, fontWeight: "500" },
  platformBtnTextActive: { color: "#fff" },
  dateRow: { flexDirection: "row" },
  toggleRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  toggleBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: "#1C1C1E", borderWidth: 1, borderColor: "#374151" },
  toggleBtnActive: { borderColor: "#4B5563" },
  toggleBtnText: { color: "#6B7280", fontSize: 12, fontWeight: "500" },
  filterActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  resetBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#374151", alignItems: "center" },
  resetBtnText: { color: "#9CA3AF", fontWeight: "600", fontSize: 14 },
  applyBtn: { flex: 2, paddingVertical: 10, borderRadius: 8, backgroundColor: "#3B82F6", alignItems: "center" },
  applyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

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

  reportCard: { marginHorizontal: 16, marginBottom: 8, backgroundColor: "#1C1C1E", borderRadius: 10, overflow: "hidden" },
  reportCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  reportTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 1 },
  reportNickname: { color: "#E5E7EB", fontSize: 14, fontWeight: "600" },
  remoteBadge: { backgroundColor: "#4C1D95", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  remoteBadgeText: { color: "#A78BFA", fontSize: 9, fontWeight: "700", letterSpacing: 0.4 },
  reportMeta: { color: "#9CA3AF", fontSize: 12, marginTop: 1 },
  reportDate: { color: "#6B7280", fontSize: 11, marginTop: 1 },
  reportBadges: { flexDirection: "row", alignItems: "center", gap: 6 },
  badgeCount: { fontSize: 13, fontWeight: "700" },
  reportDetail: { borderTopWidth: 0.5, borderTopColor: "#374151", padding: 12, gap: 6 },
  requestInlineBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  requestInlineBtnText: { color: "#60A5FA", fontSize: 12 },
  sentryId: { color: "#6B7280", fontSize: 11, marginBottom: 4 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 4, marginBottom: 4 },
  summaryItem: { color: "#22C55E", fontSize: 12, fontWeight: "600" },
  testRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
  testName: { color: "#D1D5DB", fontSize: 12 },
  testMessage: { color: "#9CA3AF", fontSize: 11, marginTop: 1 },
  testStatus: { fontSize: 10, fontWeight: "700", marginTop: 3, flexShrink: 0 },

  paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, gap: 16 },
  pageBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#1C1C1E", alignItems: "center", justifyContent: "center" },
  pageBtnDisabled: { opacity: 0.4 },
  pageLabel: { color: "#9CA3AF", fontSize: 13 },

  errorBox: { marginHorizontal: 16, marginVertical: 8, backgroundColor: "#1C1C1E", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#374151", alignItems: "center", gap: 8 },
  errorText: { color: "#EF4444", fontSize: 13, textAlign: "center" },
  retryBtn: { backgroundColor: "#1D4ED8", borderRadius: 6, paddingHorizontal: 16, paddingVertical: 6 },
  retryBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },

  searchRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, backgroundColor: "#1C1C1E", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#374151", gap: 8 },
  searchIcon: {},
  searchInput: { flex: 1, color: "#E5E7EB", fontSize: 14 },
});
