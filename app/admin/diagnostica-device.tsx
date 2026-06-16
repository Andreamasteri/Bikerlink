import React, { useCallback, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import s from "./diagnostica-styles";
import { DiagnosticReport, adminFetch, timeAgo } from "./diagnostica-types";

async function downloadDiagnosticsExport(): Promise<void> {
  const url = new URL("/api/admin/diagnostics/export", getApiUrl()).toString();
  const headers = await authFetchHeaders();

  if (Platform.OS === "web") {
    const res = await fetch(url, { headers, credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const isoDate = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const blob = new Blob([text], { type: "application/json" });
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = `bikerlink-diagnostics-${isoDate}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(objUrl); }, 1000);
  } else {
    const res = await fetch(url, { headers, credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const isoDate = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const filePath = `${FileSystem.cacheDirectory}bikerlink-diagnostics-${isoDate}.json`;
    await FileSystem.writeAsStringAsync(filePath, text, { encoding: FileSystem.EncodingType.UTF8 });
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) throw new Error("Condivisione non disponibile su questo dispositivo");
    await Sharing.shareAsync(filePath, { mimeType: "application/json", UTI: "public.json" });
  }
}

export function TabDevice() {
  const { data, isLoading, error } = useQuery<{ reports: DiagnosticReport[] }>({
    queryKey: ["/api/admin/diagnostic-reports"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/diagnostic-reports?limit=50");
      if (r.status === 404) return { reports: [] };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    retry: false,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadDiagnosticsExport();
    } catch (err) {
      Alert.alert("Errore export", (err as Error).message ?? "Impossibile scaricare il report");
    } finally {
      setExporting(false);
    }
  }, []);

  if (isLoading) return (
    <View style={s.centered}><ActivityIndicator color={Colors.accent} /></View>
  );

  if (error) return (
    <View style={[s.centered, { padding: 24 }]}>
      <Text style={s.emptyStateText}>In arrivo</Text>
      <Text style={s.emptyStateSub}>La diagnostica device sarà disponibile a breve</Text>
    </View>
  );

  const reports = data?.reports ?? [];

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <View style={s.deviceTabHeader}>
        <Text style={s.deviceTabTitle}>Report device ({reports.length})</Text>
        <TouchableOpacity
          style={[s.exportButton, exporting && s.exportButtonDisabled]}
          onPress={handleExport}
          disabled={exporting}
          activeOpacity={0.75}
        >
          {exporting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="download-outline" size={16} color="#fff" />}
          <Text style={s.exportButtonText}>
            {exporting ? "Esportando…" : "Scarica report JSON"}
          </Text>
        </TouchableOpacity>
      </View>

      {reports.length === 0 ? (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name="devices" size={40} color={Colors.textSecondary} />
          <Text style={s.emptyStateText}>Nessun report</Text>
          <Text style={s.emptyStateSub}>I report device appariranno qui quando gli utenti eseguono la diagnostica</Text>
        </View>
      ) : (
        reports.map(report => (
          <TouchableOpacity
            key={report.id}
            style={s.deviceCard}
            onPress={() => setExpandedId(expandedId === report.id ? null : report.id)}
            activeOpacity={0.75}
          >
            <View style={s.deviceCardHeader}>
              <View>
                <Text style={s.deviceCardUser}>
                  {report.userId ? `Utente ${report.userId.slice(0, 8)}` : "Anonimo"}
                </Text>
                <Text style={s.deviceCardMeta}>
                  {report.platform} · {report.appVersion} · {timeAgo(report.runAt)} fa
                </Text>
              </View>
              {report.summary && (
                <View style={[s.failBadge, { backgroundColor: report.summary.failed > 0 ? "#ef4444" : "#22c55e" }]}>
                  <Text style={s.failBadgeText}>
                    {report.summary.failed > 0 ? `${report.summary.failed} FAIL` : "OK"}
                  </Text>
                </View>
              )}
            </View>
            {expandedId === report.id && report.summary && (
              <View style={s.deviceCardBody}>
                <Text style={s.deviceSummaryLine}>Pass: {report.summary.passed}</Text>
                <Text style={s.deviceSummaryLine}>Fail: {report.summary.failed}</Text>
                <Text style={s.deviceSummaryLine}>Totale: {report.summary.totalTests}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}
