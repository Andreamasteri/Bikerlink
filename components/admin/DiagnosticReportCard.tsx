import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DiagnosticSummary, DiagnosticTestResult } from "@/lib/diagnostic/runner";

export interface DiagReport {
  id: string; userId?: string; nickname?: string; triggeredBy: string;
  appVersion?: string; platform?: string; deviceModel?: string;
  runAt: string; sentryEventId?: string; summary?: DiagnosticSummary;
  results?: DiagnosticTestResult[];
}

export type RemoteReqStatus = "idle" | "pending" | "received" | "failed";

const STATUS_COLOR: Record<string, string> = {
  PASS: "#22C55E", FAIL: "#EF4444", WARN: "#F59E0B", SKIP: "#6B7280",
};

interface Props {
  report: DiagReport;
  isExpanded: boolean;
  onToggle: () => void;
  remoteReqStatus: Record<string, { status: RemoteReqStatus; requestedAt: number }>;
  onRequestRemote: (userId: string) => void;
}

export function DiagnosticReportCard({ report: r, isExpanded, onToggle, remoteReqStatus, onRequestRemote }: Props) {
  const failed = r.summary?.failed ?? 0;
  const warned = r.summary?.warned ?? 0;
  const passed = r.summary?.passed ?? 0;
  const isRemote = r.triggeredBy === "remote";

  return (
    <TouchableOpacity style={styles.reportCard} onPress={onToggle} activeOpacity={0.8}>
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
              onPress={(e) => { e.stopPropagation?.(); if (r.userId) onRequestRemote(r.userId); }}
              disabled={remoteReqStatus[r.userId ?? ""]?.status === "pending"}
            >
              <Ionicons name="refresh-outline" size={13} color="#60A5FA" />
              <Text style={styles.requestInlineBtnText}>Richiedi nuova diagnostica</Text>
            </TouchableOpacity>
          )}
          {r.sentryEventId && <Text style={styles.sentryId}>Sentry: {r.sentryEventId}</Text>}
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
}

const styles = StyleSheet.create({
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
});
