/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiRequest, queryClient, getApiUrl, authFetchHeaders } from "@/lib/query-client";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  addDiagnosticEventListener,
  removeDiagnosticEventListener,
  setDiagnosticScreenFocused,
} from "@/lib/diagnostic/ws-client";
import { useDiagnosticWS } from "@/hooks/useDiagnosticWS";
import { DiagnosticFilterPanel, EMPTY_FILTERS } from "@/components/admin/DiagnosticFilterPanel";
import { DiagnosticReportCard } from "@/components/admin/DiagnosticReportCard";
import type { Filters } from "@/components/admin/DiagnosticFilterPanel";
import type { DiagReport, RemoteReqStatus } from "@/components/admin/DiagnosticReportCard";
import { DiagFilesList } from "./_diagnostic-reports.part2";
import { styles } from "@/components/admin/diagnostic-reports.styles";

export interface ActiveUser { userId: string; nickname: string | null; wsConnected: boolean; status?: "online" | "polling" | "offline" }
export interface ReportsResponse { reports: DiagReport[]; total: number; page: number; limit: number }
export interface DiagFileEntry { filename: string; userId: string; timestamp: string; sizeBytes: number }
export interface FilesResponse { files: DiagFileEntry[]; total: number; page: number; limit: number }

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
  const wsState = useDiagnosticWS();
  const prevWsStateRef = useRef(wsState);

  // Drive the diagnostic WS reconnect loop only while this screen is focused.
  // On focus we reset the backoff and reconnect immediately; on blur the
  // exponential reconnect loop stops (off-screen clients use the 60s polling).
  useFocusEffect(
    useCallback(() => {
      setDiagnosticScreenFocused(true);
      return () => setDiagnosticScreenFocused(false);
    }, [])
  );

  // When the WS transitions back to "connected", refresh the active-users list
  // immediately so the green dots reflect reality without a manual refresh.
  useEffect(() => {
    if (prevWsStateRef.current !== "connected" && wsState === "connected") {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/diagnostic/active-users"] });
    }
    prevWsStateRef.current = wsState;
  }, [wsState]);

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
    const onOnlineUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/diagnostic/active-users"] });
    };
    addDiagnosticEventListener("diag:progress", onProgress);
    addDiagnosticEventListener("diag:result", onResult);
    addDiagnosticEventListener("diag:online-update", onOnlineUpdate);
    return () => {
      removeDiagnosticEventListener("diag:progress", onProgress);
      removeDiagnosticEventListener("diag:result", onResult);
      removeDiagnosticEventListener("diag:online-update", onOnlineUpdate);
    };
  }, []);

  const reportsUrl = buildReportsUrl(filters, page);
  reportsUrlRef.current = reportsUrl;

  const { data: activeUsersData, isLoading: activeUsersLoading, isError: activeUsersError, refetch: refetchActiveUsers } = useQuery<{ users: ActiveUser[] }>({
    queryKey: ["/api/admin/diagnostic/active-users"],
    refetchInterval: 15000,
  });

  const { data: reportsData, isLoading: reportsLoading, isError: reportsError, refetch } = useQuery<ReportsResponse>({
    queryKey: [reportsUrl],
    refetchInterval: 30000,
    select: (data) => data,
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

  const [filesPage, setFilesPage] = useState(1);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const filesUrl = `/api/admin/diagnostic/files?page=${filesPage}&limit=20`;
  const { data: filesData, isLoading: filesLoading, isError: filesError, refetch: refetchFiles } = useQuery<FilesResponse>({
    queryKey: [filesUrl],
  });

  const [manualRefreshing, setManualRefreshing] = useState(false);
  const handleManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([refetchActiveUsers(), refetch(), refetchFiles()]);
    } finally {
      setManualRefreshing(false);
    }
  }, [refetchActiveUsers, refetch, refetchFiles]);

  const showStatusInfo = useCallback(() => {
    Alert.alert(
      "Stato utente",
      "Il pallino indica lo stato di connessione dell'utente:\n\n🟢 Verde = utente online (WebSocket connesso)\n🟡 Giallo = riconnessione / polling\n🔴 Rosso = offline / errore",
    );
  }, []);

  const downloadFile = useCallback(async (filename: string) => {
    setDownloadingFile(filename);
    try {
      const url = new URL(`/api/admin/diagnostic/files/${encodeURIComponent(filename)}`, getApiUrl()).toString();
      const res = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (Platform.OS === "web") {
        const blob = new Blob([text], { type: "application/json" });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        const fileUri = (FileSystem.cacheDirectory ?? "") + filename;
        await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, { mimeType: "application/json", dialogTitle: filename });
        } else {
          Alert.alert("File salvato", `Il file è stato salvato nella cache: ${fileUri}`);
        }
      }
    } catch (_e) {
      Alert.alert("Errore download", "Impossibile scaricare il file. Riprova.");
    } finally {
      setDownloadingFile(null);
    }
  }, []);

  const deleteFileMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await apiRequest("DELETE", `/api/admin/diagnostic/files/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error("Errore eliminazione");
      return filename;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [filesUrl] }); },
  });

  const applyFilters = useCallback(() => { setFilters(pendingFilters); setPage(1); setShowFilters(false); }, [pendingFilters]);
  const resetFilters = useCallback(() => { setPendingFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPage(1); setShowFilters(false); }, []);

  const activeUsers = activeUsersData?.users ?? [];
  const reports = reportsData?.reports ?? [];
  const totalPages = reportsData ? Math.ceil(reportsData.total / 20) : 1;
  const active = hasActiveFilters(filters);

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
        refreshControl={<RefreshControl refreshing={activeUsersLoading || reportsLoading} onRefresh={() => { void refetchActiveUsers(); void refetch(); void refetchFiles(); }} />}
      >
        <View style={styles.reportsSectionHeader}>
          <Text style={styles.sectionLabel}>UTENTI ATTIVI ({activeUsers.length})</Text>
          <TouchableOpacity
            onPress={() => { void handleManualRefresh(); }}
            disabled={manualRefreshing}
            style={styles.refreshBtnLarge}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {manualRefreshing
              ? <ActivityIndicator size="small" color="#9CA3AF" />
              : <Ionicons name="refresh" size={24} color="#9CA3AF" />}
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>
          Aggiornato ogni 15s · {wsState === "connected" ? "🟢 WS connesso" : "🟡 riconnessione…"}
        </Text>
        {activeUsersLoading && <ActivityIndicator style={{ margin: 16 }} />}
        {activeUsersError && !activeUsersLoading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Errore caricamento utenti attivi</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetchActiveUsers()}>
              <Text style={styles.retryBtnText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        )}
        {!activeUsersLoading && !activeUsersError && activeUsers.length === 0 && (
          <Text style={styles.emptyText}>Nessun utente attivo al momento</Text>
        )}
        {activeUsers.map(({ userId, nickname, wsConnected, status }) => {
          const wsSt: DiagStatus = triggeredStatus[userId] ?? "idle";
          const pollReq = remoteReqStatus[userId];
          const pollSt = pollReq?.status ?? "idle";

          const isWsPending = wsSt === "pending" || wsSt === "running";
          const isPollPending = pollSt === "pending";
          const isPending = wsConnected ? isWsPending : isPollPending;

          const displayName = nickname ?? `${userId.slice(0, 8)}…`;

          let statusLabel: string | null = null;
          if (wsConnected) {
            if (wsSt !== "idle") statusLabel = statusMap[wsSt];
          } else {
            if (pollSt === "pending") statusLabel = "⏳ In attesa…";
            else if (pollSt === "received") statusLabel = "✅ Ricevuto";
            else if (pollSt === "failed") statusLabel = "❌ Errore";
          }

          const handleAvvia = () => {
            if (wsConnected) {
              triggerMutation.mutate(userId);
            } else {
              remoteRequestMutation.mutate(userId);
            }
          };

          const btnDisabled = wsConnected
            ? isWsPending
            : (isPollPending || pollSt === "received");

          // Colore pallino allineato alla spiegazione (showStatusInfo):
          // 🟢 verde = online (WS connesso) · 🟡 giallo = riconnessione/polling
          // 🔴 rosso = offline (né WS né polling) o ultimo report in errore.
          const hasError = wsSt === "failed" || pollSt === "failed";
          const effectiveStatus = status ?? (wsConnected ? "online" : "polling");
          const dotColor = hasError || effectiveStatus === "offline"
            ? "#EF4444"
            : effectiveStatus === "polling"
            ? "#EAB308"
            : "#22C55E";

          return (
            <View key={userId} style={styles.userRow}>
              <TouchableOpacity
                onPress={showStatusInfo}
                style={styles.statusDotBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="ellipse" size={12} color={dotColor} />
              </TouchableOpacity>
              <Text style={styles.userId} numberOfLines={1}>{displayName}</Text>
              {statusLabel != null && (
                <Text style={[styles.statusText, pollSt === "received" && { color: "#22C55E" }, (wsSt === "failed" || pollSt === "failed") && { color: "#EF4444" }]}>
                  {statusLabel}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.triggerBtn, !wsConnected && styles.triggerBtnRemote, btnDisabled && styles.triggerBtnDisabled]}
                disabled={btnDisabled}
                onPress={handleAvvia}
              >
                {isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.triggerBtnText}>Avvia</Text>}
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

        <View style={styles.divider} />
        <View style={styles.reportsSectionHeader}>
          <Text style={styles.sectionLabel}>REPORT SU FILE ({filesData?.total ?? 0})</Text>
          <TouchableOpacity onPress={() => refetchFiles()} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={14} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>File JSON salvati in server/diagnostics/reports/ · pulizia automatica dopo 30 giorni</Text>

        {filesLoading && <ActivityIndicator style={{ margin: 16 }} />}
        {filesError && !filesLoading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Errore caricamento file</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetchFiles()}>
              <Text style={styles.retryBtnText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        )}
        {!filesLoading && !filesError && (filesData?.files ?? []).length === 0 && (
          <Text style={styles.emptyText}>Nessun file JSON presente</Text>
        )}
        <DiagFilesList
          files={filesData?.files ?? []}
          downloadingFile={downloadingFile}
          downloadFile={downloadFile}
          deleteFileMutation={deleteFileMutation as any}
        />

        {(filesData?.total ?? 0) > 20 && (
          <View style={styles.paginationRow}>
            <TouchableOpacity style={[styles.pageBtn, filesPage <= 1 && styles.pageBtnDisabled]} disabled={filesPage <= 1} onPress={() => setFilesPage(p => Math.max(1, p - 1))}>
              <Ionicons name="chevron-back" size={16} color={filesPage <= 1 ? "#374151" : "#9CA3AF"} />
            </TouchableOpacity>
            <Text style={styles.pageLabel}>Pagina {filesPage} / {Math.ceil((filesData?.total ?? 1) / 20)}</Text>
            <TouchableOpacity
              style={[styles.pageBtn, filesPage >= Math.ceil((filesData?.total ?? 1) / 20) && styles.pageBtnDisabled]}
              disabled={filesPage >= Math.ceil((filesData?.total ?? 1) / 20)}
              onPress={() => setFilesPage(p => Math.min(Math.ceil((filesData?.total ?? 1) / 20), p + 1))}
            >
              <Ionicons name="chevron-forward" size={16} color={filesPage >= Math.ceil((filesData?.total ?? 1) / 20) ? "#374151" : "#9CA3AF"} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
