import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import type { DiagnosticReport, DiagnosticTestResult, DiagnosticStatus } from "@/lib/diagnostic/runner";

const STATUS_ICON: Record<DiagnosticStatus, string> = {
  PASS: "✅",
  WARN: "⚠️",
  FAIL: "❌",
  SKIP: "⏭",
};

const STATUS_COLOR: Record<DiagnosticStatus, string> = {
  PASS: "#22C55E",
  WARN: "#F59E0B",
  FAIL: "#EF4444",
  SKIP: "#6B7280",
};

function SummaryBanner({ report }: { report: DiagnosticReport }) {
  const { passed, failed, warned, skipped, totalTests, durationMs } = report.summary;
  const hasErrors = failed > 0;
  const hasWarnings = warned > 0;

  const bannerColor = hasErrors ? "#7F1D1D" : hasWarnings ? "#78350F" : "#14532D";
  const bannerBorder = hasErrors ? "#EF4444" : hasWarnings ? "#F59E0B" : "#22C55E";
  const label = hasErrors
    ? "❌ Diagnostica completata con errori"
    : hasWarnings
    ? "⚠️ Diagnostica completata con avvisi"
    : "✅ Diagnostica completata — tutto OK";

  return (
    <View style={[styles.banner, { backgroundColor: bannerColor, borderColor: bannerBorder }]}>
      <Text style={styles.bannerTitle}>{label}</Text>
      <View style={styles.bannerRow}>
        <Text style={[styles.bannerStat, { color: "#22C55E" }]}>{passed} OK</Text>
        <Text style={styles.bannerDot}>·</Text>
        <Text style={[styles.bannerStat, { color: "#F59E0B" }]}>{warned} avvisi</Text>
        <Text style={styles.bannerDot}>·</Text>
        <Text style={[styles.bannerStat, { color: "#EF4444" }]}>{failed} errori</Text>
        {skipped > 0 && (
          <>
            <Text style={styles.bannerDot}>·</Text>
            <Text style={[styles.bannerStat, { color: "#6B7280" }]}>{skipped} skip</Text>
          </>
        )}
      </View>
      <Text style={styles.bannerMeta}>
        {totalTests} test · {(durationMs / 1000).toFixed(1)}s · {report.platform} · {report.deviceModel}
      </Text>
      <Text style={styles.bannerMeta}>v{report.appVersion}</Text>
    </View>
  );
}

function TestRow({ result }: { result: DiagnosticTestResult }) {
  return (
    <View style={styles.testRow}>
      <Text style={styles.testIcon}>{STATUS_ICON[result.status]}</Text>
      <View style={styles.testInfo}>
        <Text style={styles.testSection}>{result.section}</Text>
        <Text style={styles.testName}>{result.name}</Text>
        {result.message ? (
          <Text style={[styles.testMessage, { color: STATUS_COLOR[result.status] }]}>
            {result.message}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.testDuration, { color: "#6B7280" }]}>{result.durationMs}ms</Text>
    </View>
  );
}

function groupBySection(results: DiagnosticTestResult[]): Record<string, DiagnosticTestResult[]> {
  const groups: Record<string, DiagnosticTestResult[]> = {};
  for (const r of results) {
    if (!groups[r.section]) groups[r.section] = [];
    groups[r.section].push(r);
  }
  return groups;
}

export default function DiagnosticaRisultati() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const { reportJson, isAdmin } = useLocalSearchParams<{ reportJson: string; isAdmin?: string }>();
  const showAdminSend = isAdmin === "true";
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const report = useMemo<DiagnosticReport | null>(() => {
    if (!reportJson) return null;
    try {
      return JSON.parse(reportJson) as DiagnosticReport;
    } catch {
      return null;
    }
  }, [reportJson]);

  const sections = useMemo(() => {
    if (!report) return {};
    return groupBySection(report.results);
  }, [report]);

  const handleShare = async () => {
    if (!report) return;
    try {
      await Share.share({
        title: "Diagnostica BikerLink",
        message: JSON.stringify(report, null, 2),
      });
    } catch {
      // noop
    }
  };

  const handleSendToServer = async () => {
    if (!report || sendState === "sending" || sendState === "sent") return;
    setSendState("sending");
    try {
      await apiRequest("POST", "/api/diagnostic/report", {
        triggeredBy: "admin",
        appVersion: report.appVersion,
        platform: report.platform,
        deviceModel: report.deviceModel,
        sentryEventId: report.sentryEventId,
        summary: report.summary,
        results: report.results,
      });
      setSendState("sent");
    } catch {
      setSendState("error");
    }
  };

  if (!report) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>Nessun report disponibile.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Risultati Diagnostica</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <SummaryBanner report={report} />

        {Object.entries(sections).map(([section, results]) => (
          <View key={section} style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{section}</Text>
            {results.map((r, i) => (
              <TestRow key={`${r.name}-${i}`} result={r} />
            ))}
          </View>
        ))}

        {showAdminSend && (
          <TouchableOpacity
            style={[
              styles.sendButton,
              sendState === "sent" && styles.sendButtonSent,
              sendState === "error" && styles.sendButtonError,
              sendState === "sending" && styles.sendButtonDisabled,
            ]}
            onPress={handleSendToServer}
            disabled={sendState === "sending" || sendState === "sent"}
            activeOpacity={0.8}
          >
            {sendState === "sending" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name={
                  sendState === "sent"
                    ? "checkmark-circle-outline"
                    : sendState === "error"
                    ? "alert-circle-outline"
                    : "cloud-upload-outline"
                }
                size={18}
                color="#fff"
              />
            )}
            <Text style={styles.sendButtonText}>
              {sendState === "sending"
                ? "Invio…"
                : sendState === "sent"
                ? "Inviato ✓"
                : sendState === "error"
                ? "Errore — riprova"
                : "Invia al server"}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={styles.shareButtonText}>Condividi JSON</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  shareBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  content: { padding: 16, gap: 12 },
  banner: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 6,
  },
  bannerTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  bannerStat: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  bannerDot: { color: "#9CA3AF", fontSize: 14 },
  bannerMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
  },
  sectionBlock: {
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  testRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#374151",
    gap: 10,
  },
  testIcon: { fontSize: 16, marginTop: 1 },
  testInfo: { flex: 1, gap: 2 },
  testSection: { display: "none" },
  testName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#E5E7EB",
  },
  testMessage: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  testDuration: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    minWidth: 42,
    textAlign: "right",
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16A34A",
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginTop: 8,
  },
  sendButtonSent: { backgroundColor: "#15803D" },
  sendButtonError: { backgroundColor: "#DC2626" },
  sendButtonDisabled: { opacity: 0.7 },
  sendButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginTop: 8,
  },
  shareButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  errorText: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
});
