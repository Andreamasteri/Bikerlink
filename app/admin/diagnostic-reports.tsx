import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiRequest, getApiUrl, getSessionToken, queryClient } from "@/lib/query-client";
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

export default function DiagnosticReportsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [triggeredStatus, setTriggeredStatus] = useState<Record<string, DiagStatus>>({});
  // Polling-based remote requests: userId → { status, requestedAt }
  const [remoteReqStatus, setRemoteReqStatus] = useState<Record<string, { status: RemoteReqStatus; requestedAt: number }>>({});

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) return;
    const apiUrl = getApiUrl();
    const wsUrl = apiUrl.replace(/^https?:\/\//, (m) => m === "https://" ? "wss://" : "ws://") + "/ws/diagnostic";
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === "string" ? event.data : "") as { type: string; userId?: string; summary?: DiagnosticSummary; done?: number; total?: number };
          if (msg.type === "diag:progress" && msg.userId) {
            setTriggeredStatus(prev => ({ ...prev, [msg.userId!]: "running" }));
          } else if (msg.type === "diag:result" && msg.userId) {
            setTriggeredStatus(prev => ({ ...prev, [msg.userId!]: "done" }));
            queryClient.invalidateQueries({ queryKey: ["/api/admin/diagnostic-reports"] });
          }
        } catch {/* noop */}
      };
      ws.onerror = () => { wsRef.current = null; };
      ws.onclose = () => { wsRef.current = null; };
    } catch {/* noop */}
    return () => { try { wsRef.current?.close(); wsRef.current = null; } catch {/* noop */} };
  }, []);

  const { data: onlineData, isLoading: onlineLoading } = useQuery<{ users: OnlineUser[] }>({
    queryKey: ["/api/admin/diagnostic-reports/online-users"],
    refetchInterval: 15000,
  });

  const { data: reportsData, isLoading: reportsLoading, refetch } = useQuery<ReportsResponse>({
    queryKey: ["/api/admin/diagnostic-reports"],
    refetchInterval: 30000,
    select: (data) => data,
  });

  // Detect when a remote-requested diagnostic report arrives
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

  const onlineUsers = onlineData?.users ?? [];
  const reports = reportsData?.reports ?? [];

  // Unique users from reports for the "Richiedi diagnostica" section
  const usersFromReports = React.useMemo(() => {
    const seen = new Set<string>();
    const result: { userId: string; nickname?: string }[] = [];
    for (const r of reportsData?.reports ?? []) {
      if (r.userId && !seen.has(r.userId)) {
        seen.add(r.userId);
        result.push({ userId: r.userId, nickname: r.nickname });
      }
    }
    return result;
  }, [reportsData?.reports]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Diagnostica Remota</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={onlineLoading || reportsLoading} onRefresh={refetch} />}
      >
        <Text style={styles.sectionLabel}>UTENTI ONLINE (WS)</Text>
        {onlineLoading && <ActivityIndicator style={{ margin: 16 }} />}
        {!onlineLoading && onlineUsers.length === 0 && (
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
        {usersFromReports.length === 0 && !reportsLoading && (
          <Text style={styles.emptyText}>Nessun utente con report precedenti</Text>
        )}
        {usersFromReports.map(({ userId, nickname }) => {
          const req = remoteReqStatus[userId];
          const st = req?.status ?? "idle";
          const isPending = st === "pending";
          return (
            <View key={userId} style={styles.userRow}>
              <Text style={styles.userId} numberOfLines={1}>
                {nickname ?? userId.slice(0, 8) + "…"}
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
        <Text style={styles.sectionLabel}>REPORT RICEVUTI ({reportsData?.total ?? 0})</Text>
        {reportsLoading && <ActivityIndicator style={{ margin: 16 }} />}
        {!reportsLoading && reports.length === 0 && (
          <Text style={styles.emptyText}>Nessun report ancora</Text>
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
                  {(r.results ?? []).map((res, i) => (
                    <View key={i} style={styles.testRow}>
                      <View style={[styles.dot, { backgroundColor: STATUS_COLOR[res.status] ?? "#6B7280" }]} />
                      <Text style={styles.testName} numberOfLines={1}>{res.section} · {res.name}</Text>
                      {res.message ? <Text style={styles.testMessage} numberOfLines={2}>{res.message}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "600", textAlign: "center" },
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
  testRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  testName: { flex: 1, color: "#D1D5DB", fontSize: 12 },
  testMessage: { color: "#9CA3AF", fontSize: 11, flex: 1 },
});
