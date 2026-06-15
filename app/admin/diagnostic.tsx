import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Share, Platform, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { runAllTests, type DiagnosticReport, type DiagnosticTestResult } from "@/lib/diagnostic/runner";
import { apiRequest } from "@/lib/query-client";

const STATUS_COLOR: Record<string, string> = {
  PASS: "#22C55E",
  FAIL: "#EF4444",
  WARN: "#F59E0B",
  SKIP: "#6B7280",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: STATUS_COLOR[status] + "22", borderColor: STATUS_COLOR[status] }]}>
      <Text style={[styles.badgeText, { color: STATUS_COLOR[status] }]}>{status}</Text>
    </View>
  );
}

function TestRow({ result }: { result: DiagnosticTestResult }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.7} style={styles.testRow}>
      <StatusBadge status={result.status} />
      <View style={styles.testRowContent}>
        <Text style={styles.testName}>{result.name}</Text>
        {expanded && result.message ? (
          <Text style={styles.testMessage}>{result.message}</Text>
        ) : null}
      </View>
      <Text style={styles.testDuration}>{result.durationMs}ms</Text>
    </TouchableOpacity>
  );
}

function SectionGroup({ section, results }: { section: string; results: DiagnosticTestResult[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const failed = results.filter(r => r.status === "FAIL").length;
  const warned = results.filter(r => r.status === "WARN").length;
  return (
    <View style={styles.sectionGroup}>
      <TouchableOpacity onPress={() => setCollapsed(c => !c)} style={styles.sectionHeader} activeOpacity={0.7}>
        <Text style={styles.sectionTitle}>{section}</Text>
        <View style={styles.sectionMeta}>
          {failed > 0 && <Text style={[styles.sectionBadge, { color: "#EF4444" }]}>{failed} FAIL</Text>}
          {warned > 0 && <Text style={[styles.sectionBadge, { color: "#F59E0B" }]}>{warned} WARN</Text>}
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color="#6B7280" />
        </View>
      </TouchableOpacity>
      {!collapsed && results.map((r, i) => <TestRow key={i} result={r} />)}
    </View>
  );
}

export default function DiagnosticScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<DiagnosticReport | null>(null);

  const startDiagnostic = useCallback(async () => {
    setRunning(true);
    setProgress({ done: 0, total: 10 });
    setReport(null);
    try {
      const result = await runAllTests({
        isAdmin,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setReport(result);
      await apiRequest("POST", "/api/diagnostic/report", {
        triggeredBy: "auto",
        appVersion: result.appVersion,
        platform: result.platform,
        deviceModel: result.deviceModel,
        sentryEventId: result.sentryEventId,
        summary: result.summary,
        results: result.results,
      }).catch(() => {});
    } catch (err) {
      Alert.alert("Errore", err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [isAdmin]);

  const exportReport = useCallback(async () => {
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    if (Platform.OS === "web") {
      await navigator.clipboard?.writeText(json).catch(() => {});
      Alert.alert("Copiato", "Report copiato negli appunti");
      return;
    }
    try {
      await Share.share({ message: json, title: "BikerLink Diagnostic Report" });
    } catch {/* noop */}
  }, [report]);

  const sections = report
    ? [...new Set(report.results.map(r => r.section))].map(section => ({
        section,
        results: report.results.filter(r => r.section === section),
      }))
    : [];

  const progressPct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Diagnostica Locale</Text>
        {report && (
          <TouchableOpacity onPress={exportReport} style={styles.backBtn}>
            <Ionicons name="share-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={styles.summaryBox}>
          {!running && !report && (
            <Text style={styles.summaryHint}>Avvia la suite per verificare connettività, API, storage e permessi.</Text>
          )}
          {running && progress && (
            <View>
              <Text style={styles.summaryRunning}>⚡ Esecuzione in corso… {progress.done}/{progress.total}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progressPct}%` as `${number}%` }]} />
              </View>
            </View>
          )}
          {report && (
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: "#22C55E" }]}>{report.summary.passed}</Text>
                <Text style={styles.summaryLabel}>PASS</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: "#EF4444" }]}>{report.summary.failed}</Text>
                <Text style={styles.summaryLabel}>FAIL</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: "#F59E0B" }]}>{report.summary.warned}</Text>
                <Text style={styles.summaryLabel}>WARN</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: "#6B7280" }]}>{report.summary.skipped}</Text>
                <Text style={styles.summaryLabel}>SKIP</Text>
              </View>
            </View>
          )}
          {report?.sentryEventId && (
            <Text style={styles.sentryId}>Sentry ID: {report.sentryEventId}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.startBtn, running && styles.startBtnDisabled]}
          onPress={startDiagnostic}
          disabled={running}
          activeOpacity={0.8}
        >
          {running ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <MaterialCommunityIcons name="play-circle-outline" size={20} color="#fff" />
          )}
          <Text style={styles.startBtnText}>{running ? "Esecuzione…" : report ? "Ripeti test" : "Avvia diagnostica"}</Text>
        </TouchableOpacity>

        {sections.map(({ section, results }) => (
          <SectionGroup key={section} section={section} results={results} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "600", textAlign: "center" },
  summaryBox: { margin: 16, padding: 16, borderRadius: 12, backgroundColor: "#1C1C1E" },
  summaryHint: { color: "#9CA3AF", fontSize: 14, textAlign: "center" },
  summaryRunning: { color: "#F59E0B", fontSize: 14, marginBottom: 8 },
  progressBar: { height: 6, backgroundColor: "#374151", borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: "#3B82F6", borderRadius: 3 },
  summaryGrid: { flexDirection: "row", justifyContent: "space-around" },
  summaryItem: { alignItems: "center" },
  summaryCount: { fontSize: 28, fontWeight: "700" },
  summaryLabel: { fontSize: 11, color: "#6B7280", textTransform: "uppercase" },
  sentryId: { color: "#6B7280", fontSize: 11, marginTop: 8, textAlign: "center" },
  startBtn: { marginHorizontal: 16, marginBottom: 16, backgroundColor: "#3B82F6", borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 8 },
  startBtnDisabled: { opacity: 0.6 },
  startBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  sectionGroup: { marginHorizontal: 16, marginBottom: 12, backgroundColor: "#1C1C1E", borderRadius: 10, overflow: "hidden" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  sectionTitle: { color: "#E5E7EB", fontSize: 14, fontWeight: "600" },
  sectionMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionBadge: { fontSize: 12, fontWeight: "600" },
  testRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: "#374151", gap: 8 },
  testRowContent: { flex: 1 },
  testName: { color: "#D1D5DB", fontSize: 13 },
  testMessage: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  testDuration: { color: "#4B5563", fontSize: 11, minWidth: 44, textAlign: "right" },
  badge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2, minWidth: 44, alignItems: "center" },
  badgeText: { fontSize: 10, fontWeight: "700" },
});
