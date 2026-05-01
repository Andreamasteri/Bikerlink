import React, { useState, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Switch, Modal, ScrollView, Pressable } from "react-native";
import { EUROPEAN_COUNTRIES } from "@/lib/countries-regions";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { THEMES, THEME_META, ThemeName } from "@/constants/colors";
import { useTheme } from "@/lib/theme-context";
import { useT } from "@/lib/language-context";
import { getApiUrl, queryClient, apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AppSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
}

function getDefaultSettings(t: (k: string) => string) {
  return [
    { key: "splash_message", label: t("admin.splashMessage"), placeholder: t("admin.splashPlaceholder") },
    { key: "max_photos_zavorrina", label: t("admin.maxPhotosZavorrina"), placeholder: "3" },
    { key: "max_daily_votes", label: t("admin.maxDailyVotes"), placeholder: "10" },
  ];
}

function ManualAdminSection() {
  const t = useT();
  const [uploading, setUploading] = useState(false);

  const { data: manualInfo, refetch } = useQuery<{
    available: boolean;
    fileName?: string;
    fileSize?: number;
    lastModified?: string;
  }>({
    queryKey: ["/api/manual/info"],
  });

  const handleDownload = () => {
    const url = new URL("/api/manual/download", getApiUrl()).toString();
    const { Linking } = require("react-native");
    Linking.openURL(url);
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(true);
      const file = result.assets[0];
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name || "manual.pdf",
        type: "application/pdf",
      } as any);

      const res = await fetch(new URL("/api/admin/manual/upload", getApiUrl()).toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Successo", data.message || "Manuale aggiornato");
        refetch();
      } else {
        Alert.alert("Errore", data.message || "Errore upload");
      }
    } catch (e: any) {
      Alert.alert("Errore", e.message || "Errore upload");
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <View style={manualStyles.card}>
      <View style={manualStyles.row}>
        <Ionicons name="document-text" size={32} color={Colors.accent} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={manualStyles.title}>BikerLink-Manual.pdf</Text>
          <Text style={manualStyles.subtitle}>
            {manualInfo?.available
              ? `${formatSize(manualInfo.fileSize)} — ${manualInfo.lastModified ? new Date(manualInfo.lastModified).toLocaleDateString("it-IT") : ""}`
              : t("admin.noManual")}
          </Text>
        </View>
      </View>
      <View style={manualStyles.actions}>
        {manualInfo?.available && (
          <TouchableOpacity style={manualStyles.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={manualStyles.btnText}>Scarica</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[manualStyles.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={manualStyles.btnText}>Carica nuovo PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const manualStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  downloadBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  uploadBtn: {
    backgroundColor: Colors.warning,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});

function PdfDocumentAdminSection({
  title,
  fileName,
  infoEndpoint,
  downloadEndpoint,
  uploadEndpoint,
}: {
  title: string;
  fileName: string;
  infoEndpoint: string;
  downloadEndpoint: string;
  uploadEndpoint: string;
}) {
  const t = useT();
  const [uploading, setUploading] = useState(false);

  const { data: fileInfo, refetch } = useQuery<{
    available: boolean;
    fileName?: string;
    fileSize?: number;
    lastModified?: string;
  }>({
    queryKey: [infoEndpoint],
  });

  const handleDownload = () => {
    const url = new URL(downloadEndpoint, getApiUrl()).toString();
    const { Linking } = require("react-native");
    Linking.openURL(url);
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(true);
      const file = result.assets[0];
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name || "document.pdf",
        type: "application/pdf",
      } as any);

      const res = await fetch(new URL(uploadEndpoint, getApiUrl()).toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Successo", data.message || "Documento aggiornato");
        refetch();
      } else {
        Alert.alert("Errore", data.message || "Errore upload");
      }
    } catch (e: any) {
      Alert.alert("Errore", e.message || "Errore upload");
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <View style={manualStyles.card}>
      <View style={manualStyles.row}>
        <Ionicons name="document-text-outline" size={32} color={Colors.accent} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={manualStyles.title}>{fileName}</Text>
          <Text style={manualStyles.subtitle}>
            {fileInfo?.available
              ? `${formatSize(fileInfo.fileSize)} — ${fileInfo.lastModified ? new Date(fileInfo.lastModified).toLocaleDateString("it-IT") : ""}`
              : `Nessun ${title} caricato`}
          </Text>
        </View>
      </View>
      <View style={manualStyles.actions}>
        {fileInfo?.available && (
          <TouchableOpacity style={manualStyles.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={manualStyles.btnText}>Scarica</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[manualStyles.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={manualStyles.btnText}>Carica nuovo PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// =============================================================================
// Task #56 — Card "Stato email" per il pannello admin.
// Mostra: credenziali (sorgente DB/env), esito ultimo invio reale con messaggio
// di errore SMTP esatto, stato rate limiter, pulsanti test invio e reset.
// =============================================================================
interface EmailDiagnostics {
  credentials: { present: boolean; source: "db" | "env" | "none"; maskedUser: string | null };
  lastSend: {
    status: "ok" | "error" | null;
    errorCode: "no-credentials" | "auth" | "network" | "other" | null;
    error: string | null;
    recipient: string | null;
    at: string | null;
  };
}
interface RateLimitStatus {
  verifyEmail: { max: number; windowMs: number; entries: { ip: string; count: number; resetAt: string | null }[] };
  resendVerification: { max: number; windowMs: number; entries: { ip: string; count: number; resetAt: string | null }[] };
  userLockouts: { max: number; windowMs: number; entries: { userId: string; nickname?: string; count: number; firstAt: string; remainingMs: number; lockedOut: boolean }[] };
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s fa`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}min fa`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h fa`;
  return d.toLocaleString("it-IT", { timeZone: "Europe/Rome" });
}

function EmailStatusCard() {
  const t = useT();
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; messageId?: string; errorCode?: string; error?: string; smtpResponse?: string } | null>(null);

  const { data: diag, refetch: refetchDiag, isLoading: loadingDiag } = useQuery<EmailDiagnostics>({
    queryKey: ["/api/admin/email-status"],
    refetchInterval: 30000,
  });
  const { data: rl, refetch: refetchRL } = useQuery<RateLimitStatus>({
    queryKey: ["/api/admin/email-rate-limit-status"],
    refetchInterval: 30000,
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/email-test", {});
      const json = await res.json();
      setTestResult(json);
      refetchDiag();
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message || t("admin.networkError") });
    } finally {
      setTesting(false);
    }
  };

  const handleResetAll = async () => {
    Alert.alert(
      "Reset rate limit email",
      "Cancella tutti i contatori in-memory di verify-email, resend-verification e user-lockouts. Confermi?",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setResetting(true);
            try {
              await apiRequest("POST", "/api/admin/email-rate-limit-reset", { scope: "all" });
              refetchRL();
              Alert.alert("OK", "Rate limit resettati");
            } catch (e: any) {
              Alert.alert("Errore", e?.message || "Reset fallito");
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  };

  const credColor = diag?.credentials.present ? "#22c55e" : "#ef4444";
  const credLabel = diag?.credentials.present
    ? `Configurate (sorgente: ${diag.credentials.source.toUpperCase()})${diag.credentials.maskedUser ? " · " + diag.credentials.maskedUser : ""}`
    : t("admin.missingCredentials");

  const lastSendOk = diag?.lastSend.status === "ok";
  const lastSendErr = diag?.lastSend.status === "error";
  const errCodeLabel: Record<string, string> = {
    "no-credentials": "Credenziali assenti",
    "auth": "Auth Gmail rifiutata (App Password revocata?)",
    "network": t("admin.networkError"),
    "other": t("admin.smtpError"),
  };

  const totalRLEntries = (rl?.verifyEmail.entries.length ?? 0) + (rl?.resendVerification.entries.length ?? 0) + (rl?.userLockouts.entries.length ?? 0);

  return (
    <View style={emailStatusStyles.card}>
      <View style={emailStatusStyles.headerRow}>
        <Ionicons name="mail" size={20} color={Colors.accent} />
        <Text style={emailStatusStyles.title}>Stato email</Text>
        <TouchableOpacity onPress={() => { refetchDiag(); refetchRL(); }} style={emailStatusStyles.iconBtn}>
          <Ionicons name="refresh" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loadingDiag ? (
        <ActivityIndicator color={Colors.accent} style={{ marginVertical: 16 }} />
      ) : (
        <>
          {/* Banner rosso se ultimo invio fallito */}
          {lastSendErr && (
            <View style={emailStatusStyles.alertBanner}>
              <Ionicons name="warning" size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={emailStatusStyles.alertTitle}>
                  Ultimo invio FALLITO — {errCodeLabel[diag?.lastSend.errorCode ?? "other"] ?? "errore"}
                </Text>
                {diag?.lastSend.error ? (
                  <Text style={emailStatusStyles.alertBody} numberOfLines={6}>{diag.lastSend.error}</Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Credenziali */}
          <View style={emailStatusStyles.row}>
            <View style={[emailStatusStyles.dot, { backgroundColor: credColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={emailStatusStyles.rowLabel}>Credenziali Gmail</Text>
              <Text style={emailStatusStyles.rowValue}>{credLabel}</Text>
            </View>
          </View>

          {/* Ultimo invio */}
          <View style={emailStatusStyles.row}>
            <View style={[emailStatusStyles.dot, { backgroundColor: lastSendOk ? "#22c55e" : lastSendErr ? "#ef4444" : "#666" }]} />
            <View style={{ flex: 1 }}>
              <Text style={emailStatusStyles.rowLabel}>Ultimo invio reale</Text>
              <Text style={emailStatusStyles.rowValue}>
                {diag?.lastSend.status === null
                  ? t("admin.noSendRegistered")
                  : `${lastSendOk ? "OK" : "ERRORE"} · ${formatRelative(diag?.lastSend.at ?? null)}${diag?.lastSend.recipient ? " · " + diag.lastSend.recipient : ""}`}
              </Text>
            </View>
          </View>

          {/* Rate limiter */}
          <View style={emailStatusStyles.row}>
            <View style={[emailStatusStyles.dot, { backgroundColor: totalRLEntries > 0 ? "#f59e0b" : "#22c55e" }]} />
            <View style={{ flex: 1 }}>
              <Text style={emailStatusStyles.rowLabel}>Rate limiter</Text>
              <Text style={emailStatusStyles.rowValue}>
                verify-email: {rl?.verifyEmail.entries.length ?? 0} IP · resend: {rl?.resendVerification.entries.length ?? 0} IP · lockout utenti: {rl?.userLockouts.entries.length ?? 0}
              </Text>
              {(rl?.userLockouts.entries.length ?? 0) > 0 && (
                <Text style={emailStatusStyles.rlDetail}>
                  Utenti in lockout: {rl?.userLockouts.entries.map((e) => e.nickname || e.userId.slice(0, 8)).join(", ")}
                </Text>
              )}
            </View>
          </View>

          {/* Risultato test invio */}
          {testResult && (
            <View style={[emailStatusStyles.testResult, { backgroundColor: testResult.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", borderLeftColor: testResult.ok ? "#22c55e" : "#ef4444" }]}>
              <Text style={[emailStatusStyles.testResultTitle, { color: testResult.ok ? "#22c55e" : "#ef4444" }]}>
                {testResult.ok ? t("admin.testSendOk") : `✗ Test invio fallito${testResult.errorCode ? " (" + testResult.errorCode + ")" : ""}`}
              </Text>
              {testResult.messageId ? (
                <Text style={emailStatusStyles.testResultBody}>messageId: {testResult.messageId}</Text>
              ) : null}
              {testResult.error ? (
                <Text style={emailStatusStyles.testResultBody}>{testResult.error}</Text>
              ) : null}
              {testResult.smtpResponse ? (
                <Text style={emailStatusStyles.testResultBody}>SMTP: {testResult.smtpResponse}</Text>
              ) : null}
            </View>
          )}

          {/* Pulsanti */}
          <View style={emailStatusStyles.btnRow}>
            <TouchableOpacity
              style={[emailStatusStyles.btn, emailStatusStyles.btnPrimary, testing && { opacity: 0.6 }]}
              onPress={handleTest}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={16} color="#fff" />
                  <Text style={emailStatusStyles.btnText}>Invia email di test</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[emailStatusStyles.btn, emailStatusStyles.btnSecondary, resetting && { opacity: 0.6 }]}
              onPress={handleResetAll}
              disabled={resetting}
            >
              {resetting ? (
                <ActivityIndicator color={Colors.text} size="small" />
              ) : (
                <>
                  <Ionicons name="refresh-circle" size={16} color={Colors.text} />
                  <Text style={[emailStatusStyles.btnText, { color: Colors.text }]}>Reset rate limit</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const emailStatusStyles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  title: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text },
  iconBtn: { padding: 4 },
  alertBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#dc2626", padding: 12, borderRadius: 10, marginBottom: 14 },
  alertTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#fff", marginBottom: 4 },
  alertBody: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#fff", lineHeight: 16 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  rowLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2 },
  rowValue: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  rlDetail: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#f59e0b", marginTop: 2 },
  testResult: { padding: 10, borderRadius: 8, borderLeftWidth: 3, marginVertical: 12 },
  testResultTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 4 },
  testResultBody: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: 10 },
  btnPrimary: { backgroundColor: Colors.accent },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.border },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
});

export default function AdminSettings() {
  const t = useT();
  const defaultSettings = getDefaultSettings(t);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { currentTheme, setTheme, colors: themeColors } = useTheme();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [protectedToggle, setProtectedToggle] = useState<{ key: string; value: boolean; label: string } | null>(null);
  const [protectedPassword, setProtectedPassword] = useState("");
  const [matchingCountries, setMatchingCountries] = useState<string[]>([]);
  const [matchingTriggerFeedback, setMatchingTriggerFeedback] = useState<string | null>(null);
  const [clubInviteFeedback, setClubInviteFeedback] = useState<string | null>(null);
  const [uptimeWidgetEnabled, setUptimeWidgetEnabled] = useState<boolean>(true);
  const [matchingEngineExpanded, setMatchingEngineExpanded] = useState(false);
  const [coordHistoryExpanded, setCoordHistoryExpanded] = useState(false);
  const [musicSystemExpanded, setMusicSystemExpanded] = useState(false);
  const [mapsExpanded, setMapsExpanded] = useState(false);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [bgLocationExpanded, setBgLocationExpanded] = useState(false);
  const [floatingWidgetExpanded, setFloatingWidgetExpanded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("uptime_widget_enabled").then((val) => {
      setUptimeWidgetEnabled(val === null ? true : val === "true");
    });
  }, []);

  const handleUptimeToggle = (val: boolean) => {
    setUptimeWidgetEnabled(val);
    AsyncStorage.setItem("uptime_widget_enabled", val ? "true" : "false");
  };

  const { data: settings = [], isLoading } = useQuery<AppSetting[]>({
    queryKey: ["/api/admin/settings"],
    enabled: isAdmin,
  });

  const { data: adsEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ads-enabled"],
  });
  const adsEnabled = adsEnabledData?.enabled !== false;

  const { data: synecoData } = useQuery<{ visible: boolean }>({
    queryKey: ["/api/settings/syneco-branding"],
  });
  const synecoVisible = synecoData?.visible === true;

  const { data: emailVerifData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/email-verification"],
  });
  const emailVerifEnabled = emailVerifData?.enabled === true;

  const { data: autoMatchData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/auto-matching"],
  });
  const autoMatchEnabled = autoMatchData?.enabled !== false;

  const { data: refetchIntervalData } = useQuery<{ seconds: number }>({
    queryKey: ["/api/settings/profile-refetch-interval"],
  });
  const [refetchIntervalInput, setRefetchIntervalInput] = useState("");
  useEffect(() => {
    if (refetchIntervalData?.seconds != null && refetchIntervalInput === "") {
      setRefetchIntervalInput(String(refetchIntervalData.seconds));
    }
  }, [refetchIntervalData]);

  const { data: coordMaxAgeData } = useQuery<{ value: number }>({
    queryKey: ["/api/admin/settings/coordinates_max_age_seconds"],
    enabled: isAdmin,
  });
  const [coordMaxAgeInput, setCoordMaxAgeInput] = useState("");
  useEffect(() => {
    if (coordMaxAgeData?.value != null && coordMaxAgeInput === "") {
      setCoordMaxAgeInput(String(coordMaxAgeData.value));
    }
  }, [coordMaxAgeData]);

  const { data: coordHistorySettings, refetch: refetchCoordHistory } = useQuery<{
    enabled: boolean; interval: number; maxRecords: number; mode: string; selectedUsers: string[];
  }>({
    queryKey: ["/api/admin/coordinate-history/settings"],
    enabled: isAdmin,
  });
  const { data: coordHistoryStats } = useQuery<{
    totalRecords: number; trackedUsers: number; oldestRecord: string | null; newestRecord: string | null;
  }>({
    queryKey: ["/api/admin/coordinate-history/stats"],
    enabled: isAdmin,
  });
  const [chIntervalInput, setChIntervalInput] = useState("");
  const [chMaxRecordsInput, setChMaxRecordsInput] = useState("");
  useEffect(() => {
    if (coordHistorySettings?.interval != null && chIntervalInput === "") {
      setChIntervalInput(String(coordHistorySettings.interval));
    }
    if (coordHistorySettings?.maxRecords != null && chMaxRecordsInput === "") {
      setChMaxRecordsInput(String(coordHistorySettings.maxRecords));
    }
  }, [coordHistorySettings]);

  const coordHistoryMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const url = new URL("/api/admin/coordinate-history/settings", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) throw new Error(t("admin.settingsUpdateError"));
      return res.json();
    },
    onSuccess: () => {
      refetchCoordHistory();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coordinate-history/stats"] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const [chUserSearch, setChUserSearch] = useState("");
  const { data: chSearchResults } = useQuery<Array<{ id: string; nickname: string; userType: string }>>({
    queryKey: ["/api/users/search", chUserSearch],
    enabled: coordHistoryExpanded && coordHistorySettings?.mode === "selected" && chUserSearch.length >= 2,
  });

  const { data: bgLocationSettings, refetch: refetchBgLocation } = useQuery<{
    enabled: boolean;
    trigger: string;
    intervalSeconds: number;
    notificationText: string;
    ghostModeContinue: boolean;
  }>({
    queryKey: ["/api/admin/settings/bg-location"],
    enabled: isAdmin,
  });
  const [bgIntervalInput, setBgIntervalInput] = useState("");
  const [bgNotificationTextInput, setBgNotificationTextInput] = useState("");
  useEffect(() => {
    if (bgLocationSettings?.intervalSeconds != null && bgIntervalInput === "") {
      setBgIntervalInput(String(bgLocationSettings.intervalSeconds));
    }
    if (bgLocationSettings?.notificationText != null && bgNotificationTextInput === "") {
      setBgNotificationTextInput(bgLocationSettings.notificationText);
    }
  }, [bgLocationSettings]);

  const bgLocationMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const url = new URL("/api/admin/settings/bg-location", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("admin.genericError2") }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      refetchBgLocation();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/bg-location"] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const { data: primalData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/primal-user"],
  });
  const primalEnabled = primalData?.enabled === true;

  const { data: motoclubCreationData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/motoclub-user-creation"],
  });
  const motoclubCreationEnabled = motoclubCreationData?.enabled === true;

  const { data: customRoutesData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/custom-routes"],
  });
  const customRoutesEnabled = customRoutesData?.enabled !== false;

  const { data: motoclubZavData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/motoclub-include-zav"],
  });
  const motoclubZavEnabled = motoclubZavData?.enabled !== false;

  const { data: ghostModeData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ghost-mode-enabled"],
  });
  const ghostModeEnabled = ghostModeData?.enabled === true;

  const { data: phoneFieldData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/phone-field-enabled"],
  });
  const phoneFieldEnabled = phoneFieldData?.enabled === true;

  const { data: userAvailableData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/user-available-on-login"],
  });
  const userAvailableOnLogin = userAvailableData?.enabled !== false;

  const { data: showSearchPrefData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/show-search-preference"],
  });
  const showSearchPrefEnabled = showSearchPrefData?.enabled === true;

  const { data: themeServerData } = useQuery<{ userSwitchingEnabled: boolean; defaultTheme: string }>({
    queryKey: ["/api/settings/theme"],
  });
  const themeUserSwitching = themeServerData?.userSwitchingEnabled === true;
  const themeDefaultName: ThemeName = (["attuale", "asfalto", "velocita", "rotta"] as ThemeName[]).includes(themeServerData?.defaultTheme as ThemeName)
    ? (themeServerData!.defaultTheme as ThemeName)
    : "attuale";

  const themeSwitchingMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const url = new URL("/api/admin/settings/theme_user_switching_enabled", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: value ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(t("admin.themeUpdateError"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/theme"] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const themeDefaultMutation = useMutation({
    mutationFn: async (value: ThemeName) => {
      const url = new URL("/api/admin/settings/theme_default", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(t("admin.defaultThemeUpdateError"));
      return res.json();
    },
    onSuccess: (_data, variables) => {
      setTheme(variables);
      queryClient.invalidateQueries({ queryKey: ["/api/settings/theme"] });
    },
    onError: (e: Error) => Alert.alert("Errore", e.message),
  });

  const { data: allSettingsData } = useQuery<{ unitsPrefEnabled?: boolean }>({
    queryKey: ["/api/settings/all"],
    staleTime: 120000,
  });
  const unitsPrefEnabled = allSettingsData?.unitsPrefEnabled === true;

  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery<{
    available: boolean;
    inProgress: boolean;
    lastSync: { startedAt: string; finishedAt?: string; ok: boolean; error?: string } | null;
    nextScheduledAt: string | null;
  }>({
    queryKey: ["/api/admin/sync-status"],
    refetchInterval: 10000,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/sync-prod-to-dev", {}),
    onSuccess: () => {
      refetchSyncStatus();
      Alert.alert(t("admin.syncCompleted"), t("admin.devSyncMsg"));
    },
    onError: (e: Error) => Alert.alert("Errore sync", e.message),
  });

  const disableFeatureMutation = useMutation({
    mutationFn: async (key: string) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/disable-feature", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("admin.genericError2") }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ads-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/syneco-branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const protectedToggleMutation = useMutation({
    mutationFn: async ({ key, value, adminPassword }: { key: string; value: string; adminPassword: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/toggle-protected", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, adminPassword }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("admin.genericError2") }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/email-verification"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/syneco-branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ads-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/donation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/gps-required"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/marketplace-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ghost-mode-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/phone-field-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/user-available-on-login"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/floating-widget"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      setProtectedToggle(null);
      setProtectedPassword("");
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const { data: sosData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/sos-enabled"],
  });
  const sosEnabled = sosData?.enabled !== false;

  const { data: phoneSensorsData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/phone-sensors-enabled"],
  });
  const phoneSensorsEnabled = phoneSensorsData?.enabled === true;

  const { data: musicMatchData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/music-match"],
  });
  const musicMatchEnabled = musicMatchData?.enabled !== false;

  const { data: musicExportData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/music-export-playlist"],
  });
  const musicExportEnabled = musicExportData?.enabled !== false;

  const { data: musicImportData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/music-import-playlist"],
  });
  const musicImportEnabled = musicImportData?.enabled !== false;

  const { data: homeMessageData } = useQuery<{ enabled: boolean; text: string }>({
    queryKey: ["/api/settings/home-message"],
  });
  const homeMessageEnabled = homeMessageData?.enabled === true;
  const [homeMessageText, setHomeMessageText] = useState("");
  const [isSavingHomeMessage, setIsSavingHomeMessage] = useState(false);

  React.useEffect(() => {
    if (homeMessageData?.text !== undefined) {
      setHomeMessageText(homeMessageData.text);
    }
  }, [homeMessageData?.text]);

  const homeMessageToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/home_message_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/home-message"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  async function handleSaveHomeMessageText() {
    try {
      setIsSavingHomeMessage(true);
      await apiRequest("PUT", "/api/admin/settings/home_message_text", { value: homeMessageText });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/home-message"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Messaggio home salvato");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante il salvataggio");
    } finally {
      setIsSavingHomeMessage(false);
    }
  }

  const sosMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/sos_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/sos-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const phoneSensorsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/phone_sensors_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/phone-sensors-enabled"] });
    },
  });

  const musicMatchMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/music_match_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/music-match"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const musicExportMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/music_export_playlist_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/music-export-playlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const musicImportMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/music_import_playlist_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/music-import-playlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const customRoutesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/custom_routes_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/custom-routes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const motoclubZavMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/motoclub_include_zav", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/motoclub-include-zav"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const autoMatchMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/auto_matching_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/auto-matching"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const refetchIntervalMutation = useMutation({
    mutationFn: async (seconds: string) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/profile_refetch_interval", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: seconds }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/profile-refetch-interval"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const { data: floatingWidgetData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/floating-widget"],
    staleTime: 30_000,
  });
  const floatingWidgetEnabled = floatingWidgetData?.enabled !== false;

  const coordMaxAgeMutation = useMutation({
    mutationFn: async (seconds: string) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/coordinates_max_age_seconds", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: seconds }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/coordinates_max_age_seconds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const showSearchPrefMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/show_search_preference", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/show-search-preference"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const motoclubCreationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/motoclub_user_creation_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/motoclub-user-creation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const { data: matchingStats, refetch: refetchMatchingStats } = useQuery<{
    totalZavarrinaMatches: number;
    totalBikerBikerMatches: number;
    lastCycle: { completedAt: string; durationMs: number; zavarrinaMatchesNew: number; bikerBikerMatchesNew: number } | null;
  }>({
    queryKey: ["/api/admin/matching-stats"],
    refetchInterval: 30000,
  });

  const matchingTriggerMutation = useMutation({
    mutationFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/matching/trigger", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ started: boolean; reason?: string }>;
    },
    onSuccess: (data) => {
      if (data.started) {
        setMatchingTriggerFeedback("Ciclo avviato");
      } else if (data.reason?.startsWith("debounced")) {
        const match = data.reason.match(/last run (\d+)s ago/);
        const sec = match ? match[1] : "?";
        setMatchingTriggerFeedback(`Debounce attivo (ultimo ciclo ${sec}s fa)`);
      } else if (data.reason === "already_running") {
        setMatchingTriggerFeedback(t("admin.alreadyRunning"));
      } else {
        setMatchingTriggerFeedback(data.reason ?? "Risposta inattesa");
      }
      setTimeout(() => setMatchingTriggerFeedback(null), 5000);
      refetchMatchingStats();
    },
    onError: () => setMatchingTriggerFeedback("Errore nel trigger"),
  });

  const { data: matchingCountriesData } = useQuery<{ countries: string[] }>({
    queryKey: ["/api/admin/settings/matching_countries"],
  });

  useEffect(() => {
    if (matchingCountriesData?.countries) {
      setMatchingCountries(matchingCountriesData.countries);
    }
  }, [matchingCountriesData]);

  const matchingCountriesMutation = useMutation({
    mutationFn: async (countries: string[]) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/matching_countries", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(countries) }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/matching_countries"] });
    },
  });

  const reconcileClubInvitesMutation = useMutation({
    mutationFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/reconcile-club-invites", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: { motorsChecked: number; pendingInvites: number; message: string }) => {
      setClubInviteFeedback(data.message);
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/motoclubs");
        },
      });
    },
    onError: (error: Error) => {
      setClubInviteFeedback(`Errore: ${error.message}`);
    },
  });

  const primalMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/primal_user_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/primal-user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const { data: mapsData } = useQuery<{ enabled: boolean; provider: string; userChoiceEnabled: boolean }>({
    queryKey: ["/api/settings/maps"],
  });
  const mapsEnabled = mapsData?.enabled !== false;
  const mapsProvider = (mapsData?.provider || "carto_light") as "carto_light" | "carto_dark" | "esri_gray";
  const mapsUserChoiceEnabled = mapsData?.userChoiceEnabled !== false;
  const mapsEnabledMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/maps_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const mapsProviderMutation = useMutation({
    mutationFn: async (provider: string) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/maps_provider", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: provider }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const mapsUserChoiceMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/maps_user_choice_enabled", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const [isUploadingEula, setIsUploadingEula] = useState(false);

  const [paypalEmail, setPaypalEmail] = useState("");
  const [isSavingPaypal, setIsSavingPaypal] = useState(false);

  const { data: donationData } = useQuery<{ enabled: boolean; text: string; paypalEmail: string }>({
    queryKey: ["/api/settings/donation"],
  });
  const donationEnabled = donationData?.enabled !== false;

  const [donationText, setDonationText] = useState("");
  const [donationTextPassword, setDonationTextPassword] = useState("");
  const [showDonationTextPasswordModal, setShowDonationTextPasswordModal] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);

  React.useEffect(() => {
    if (donationData?.text !== undefined) {
      setDonationText(donationData.text);
    }
  }, [donationData?.text]);

  const { data: gpsRequiredData } = useQuery<{ required: boolean }>({
    queryKey: ["/api/settings/gps-required"],
  });
  const gpsRequired = gpsRequiredData?.required !== false;

  const { data: marketplaceData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/marketplace-enabled"],
  });
  const marketplaceEnabled = marketplaceData?.enabled !== false;

  const { data: otaGateData, refetch: refetchOtaGate } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ota-gate-enabled"],
  });
  const otaGateEnabled = otaGateData?.enabled === true;

  const { data: otaWaitData, refetch: refetchOtaWait } = useQuery<{ seconds: number }>({
    queryKey: ["/api/settings/ota-wait-seconds"],
  });
  const [otaWaitInput, setOtaWaitInput] = useState("10");
  useEffect(() => {
    if (otaWaitData?.seconds !== undefined) {
      setOtaWaitInput(String(otaWaitData.seconds));
    }
  }, [otaWaitData?.seconds]);

  const otaGateMutation = useMutation({
    mutationFn: async (val: boolean) => {
      await apiRequest("PUT", "/api/admin/settings/ota_gate_enabled", { value: val ? "true" : "false" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ota-gate-enabled"] });
      refetchOtaGate();
    },
  });

  const otaWaitMutation = useMutation({
    mutationFn: async (val: string) => {
      await apiRequest("PUT", "/api/admin/settings/ota_wait_seconds", { value: val });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ota-wait-seconds"] });
      refetchOtaWait();
    },
  });

  const [emailConfigModalVisible, setEmailConfigModalVisible] = useState(false);
  const [emailConfigAdminPass, setEmailConfigAdminPass] = useState("");
  const [emailConfigGmail, setEmailConfigGmail] = useState("");
  const [emailConfigAppPass, setEmailConfigAppPass] = useState("");
  const [isSavingEmailConfig, setIsSavingEmailConfig] = useState(false);

  const { data: emailConfigData } = useQuery<{ configured: boolean; maskedEmail: string }>({
    queryKey: ["/api/admin/settings/email-config"],
  });

  async function handleSaveEmailConfig() {
    if (!emailConfigAdminPass) {
      Alert.alert(t("common.error"), t("admin.passwordRequired"));
      return;
    }
    if (!emailConfigGmail && !emailConfigAppPass) {
      Alert.alert("Errore", "Inserisci almeno un campo da aggiornare");
      return;
    }
    try {
      setIsSavingEmailConfig(true);
      await apiRequest("PUT", "/api/admin/settings/email-config", {
        gmailUser: emailConfigGmail || undefined,
        gmailAppPassword: emailConfigAppPass || undefined,
        adminPassword: emailConfigAdminPass,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/email-config"] });
      setEmailConfigModalVisible(false);
      setEmailConfigAdminPass("");
      setEmailConfigGmail("");
      setEmailConfigAppPass("");
      Alert.alert("Successo", "Configurazione email aggiornata");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Password admin non corretta o errore durante il salvataggio");
    } finally {
      setIsSavingEmailConfig(false);
    }
  }

  const { data: paypalData } = useQuery<{ email: string }>({
    queryKey: ["/api/settings/paypal"],
  });

  React.useEffect(() => {
    if (paypalData?.email !== undefined) {
      setPaypalEmail(paypalData.email);
    }
  }, [paypalData?.email]);

  async function handleSavePaypal() {
    try {
      setIsSavingPaypal(true);
      await apiRequest("PUT", "/api/admin/settings/paypal_email", { value: paypalEmail });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/paypal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/donation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      Alert.alert("Successo", "Email supporto salvata con successo");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante il salvataggio");
    } finally {
      setIsSavingPaypal(false);
    }
  }

  const [splashMode, setSplashMode] = useState<"single" | "cycle">("single");
  const [splashMessagesList, setSplashMessagesList] = useState<string[]>([]);
  const splashMessagesListRef = React.useRef<string[]>([]);
  React.useEffect(() => { splashMessagesListRef.current = splashMessagesList; }, [splashMessagesList]);

  React.useEffect(() => {
    if (settings && settings.length > 0) {
      const modeSetting = settings.find(s => s.key === "splash_message_mode");
      if (modeSetting?.value === "cycle") setSplashMode("cycle");
      else setSplashMode("single");

      const listSetting = settings.find(s => s.key === "splash_messages_list");
      try {
        const parsed = JSON.parse(listSetting?.value || "[]");
        if (Array.isArray(parsed)) setSplashMessagesList(parsed);
      } catch {}
    }
  }, [settings]);

  async function handleSaveSplashMode(mode: "single" | "cycle") {
    setSplashMode(mode);
    try {
      await apiRequest("PUT", "/api/admin/settings/splash_message_mode", { value: mode });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/splash"] });
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante il salvataggio");
    }
  }

  async function persistSplashList(list: string[]) {
    try {
      await apiRequest("PUT", "/api/admin/settings/splash_messages_list", { value: JSON.stringify(list) });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/splash"] });
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante il salvataggio");
    }
  }

  async function handleSaveSplashList(list: string[]) {
    setSplashMessagesList(list);
    await persistSplashList(list);
  }

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/admin/settings/${key}`, baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      setEditingKey(null);
      setEditValue("");
    },
  });

  async function handleUploadEula() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "text/plain",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];

      setIsUploadingEula(true);

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.name || "eula.txt",
        type: "text/plain",
      } as any);

      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/eula/upload", baseUrl);

      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Errore durante l'upload" }));
        Alert.alert("Errore", errorData.message || "Errore durante l'upload");
        return;
      }

      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });

      if (editingKey === "eula_text" && data.value) {
        setEditValue(data.value);
      }

      Alert.alert("Successo", "EULA caricato con successo");
    } catch (error: any) {
      Alert.alert("Errore", error.message || "Errore durante l'upload del file");
    } finally {
      setIsUploadingEula(false);
    }
  }

  function getSettingValue(key: string): string {
    const setting = (settings || []).find((s) => s.key === key);
    return setting?.value ?? "";
  }

  function startEditing(key: string) {
    setEditingKey(key);
    setEditValue(getSettingValue(key));
  }

  function handleSave() {
    if (!editingKey) return;
    updateMutation.mutate({ key: editingKey, value: editValue });
  }

  function renderSettingCard(setting: typeof defaultSettings[number]) {
    return (
      <View key={setting.key} style={styles.settingCard}>
        <View style={styles.settingHeader}>
          <Text style={styles.settingLabel}>{setting.label}</Text>
          <View style={styles.settingActions}>
            {setting.key === "eula_text" && editingKey !== setting.key && (
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={handleUploadEula}
                disabled={isUploadingEula}
              >
                {isUploadingEula ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <Ionicons name="cloud-upload" size={20} color={Colors.accent} />
                )}
              </TouchableOpacity>
            )}
            {editingKey !== setting.key && (
              <TouchableOpacity onPress={() => startEditing(setting.key)}>
                <Ionicons name="create" size={20} color={Colors.accent} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {editingKey === setting.key ? (
          <View>
            <TextInput
              style={styles.input}
              placeholder={setting.placeholder}
              placeholderTextColor={Colors.textSecondary}
              value={editValue}
              onChangeText={setEditValue}
              multiline={setting.key === "eula_text"}
              numberOfLines={setting.key === "eula_text" ? 6 : 1}
            />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingKey(null)}>
                <Text style={styles.cancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                disabled={updateMutation.isPending}
              >
                <Text style={styles.saveBtnText}>{updateMutation.isPending ? "..." : t("admin.saveBtn")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={styles.settingValue}>
            {getSettingValue(setting.key) || setting.placeholder}
          </Text>
        )}
      </View>
    );
  }

  const sortedMatchingCountries = useMemo(() => {
    const itEntry = EUROPEAN_COUNTRIES.find((c) => c.code === "IT");
    const rest = EUROPEAN_COUNTRIES.filter((c) => c.code !== "IT").sort((a, b) => a.name.localeCompare(b.name));
    return itEntry ? [itEntry, ...rest] : rest;
  }, []);

  const splashSetting = defaultSettings.find(s => s.key === "splash_message")!;
  const maxPhotosSetting = defaultSettings.find(s => s.key === "max_photos_zavorrina")!;
  const maxVotesSetting = defaultSettings.find(s => s.key === "max_daily_votes")!;

  return (
    <>
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      bottomOffset={20}
    >

      {/* Task #56: card "Stato email" in cima — diagnostica invio + rate limiter */}
      <EmailStatusCard />

      <View style={[styles.sectionHeaderRow, { marginTop: 0 }]}>
        <Ionicons name="color-palette" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Colori App</Text>
      </View>

      <View style={themeStyles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={themeStyles.switchLabel}>Permetti agli utenti di cambiare tema</Text>
          <Text style={themeStyles.switchDesc}>
            {themeUserSwitching
              ? "Ogni utente sceglie il proprio stile visivo"
              : t("admin.themeForAll")}
          </Text>
        </View>
        <Switch
          value={themeUserSwitching}
          onValueChange={(val) => themeSwitchingMutation.mutate(val)}
          trackColor={{ false: Colors.border, true: Colors.accent + "88" }}
          thumbColor={themeUserSwitching ? Colors.accent : Colors.textSecondary}
          disabled={themeSwitchingMutation.isPending}
        />
      </View>

      {!themeUserSwitching && (
        <>
          <Text style={themeStyles.defaultLabel}>Tema predefinito per tutti gli utenti:</Text>
          <View style={themeStyles.grid}>
            {(["attuale", "asfalto", "velocita", "rotta"] as ThemeName[]).map((name) => {
              const theme = THEMES[name];
              const meta = THEME_META[name];
              const isActive = themeDefaultName === name;
              return (
                <TouchableOpacity
                  key={name}
                  style={[themeStyles.card, isActive && themeStyles.cardActive]}
                  onPress={() => themeDefaultMutation.mutate(name)}
                  activeOpacity={0.8}
                  disabled={themeDefaultMutation.isPending}
                >
                  {isActive && (
                    <View style={themeStyles.checkmark}>
                      <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
                    </View>
                  )}
                  <View style={themeStyles.swatches}>
                    <View style={[themeStyles.swatch, { backgroundColor: theme.background }]} />
                    <View style={[themeStyles.swatch, { backgroundColor: theme.accent }]} />
                    <View style={[themeStyles.swatch, { backgroundColor: theme.surface }]} />
                  </View>
                  <Text style={themeStyles.cardLabel} numberOfLines={1}>{meta.label}</Text>
                  <Text style={themeStyles.cardDesc} numberOfLines={2}>{meta.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {!themeUserSwitching && (
        <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 16, marginHorizontal: 4 }} />
      )}
      <Text style={[themeStyles.defaultLabel, { marginBottom: 8 }]}>Il tuo tema (questo dispositivo):</Text>
      <View style={brandThemeStyles.grid}>
        {(Object.keys(THEMES) as ThemeName[]).map((key) => {
          const theme = THEMES[key];
          const isSelected = currentTheme === key;
          return (
            <TouchableOpacity
              key={key}
              style={[brandThemeStyles.card, isSelected && brandThemeStyles.cardSelected]}
              onPress={() => setTheme(key)}
              activeOpacity={0.75}
            >
              <View style={[brandThemeStyles.swatch, { backgroundColor: theme.background }]}>
                <View style={[brandThemeStyles.swatchAccent, { backgroundColor: theme.accent }]} />
                <View style={[brandThemeStyles.swatchSurface, { backgroundColor: theme.surface }]} />
                <View style={[brandThemeStyles.swatchText, { backgroundColor: theme.text + "33" }]} />
              </View>
              <View style={brandThemeStyles.cardBody}>
                <Text style={[brandThemeStyles.cardLabel, isSelected && { color: Colors.accent }]}>
                  {THEME_META[key].label}
                </Text>
                <Text style={brandThemeStyles.cardDesc}>{THEME_META[key].description}</Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={20} color={Colors.accent} style={{ marginLeft: "auto" }} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="apps" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>{t("admin.appFeatures")}</Text>
      </View>

      <View style={styles.accordionPanel}>
        <Pressable style={styles.accordionPanelHeader} onPress={() => setMatchingEngineExpanded((v) => !v)}>
          <View style={styles.synecoInfo}>
            <Ionicons name="git-network" size={20} color={Colors.warning} />
            <Text style={styles.accordionPanelTitle}>Matching Engine</Text>
          </View>
          <Ionicons name={matchingEngineExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </Pressable>
        {matchingEngineExpanded && (
          <View style={styles.accordionPanelContent}>
            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="git-compare" size={20} color={Colors.warning} />
                  <Text style={styles.synecoLabel}>Match Automatico</Text>
          </View>
          <Switch
            value={autoMatchEnabled}
            onValueChange={(val) => autoMatchMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={autoMatchEnabled ? Colors.text : Colors.textSecondary}
            disabled={autoMatchMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {autoMatchEnabled ? t("admin.matchEngineActive") : t("admin.matchEngineInactive")}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="search" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Mostra "Ricerca Match con..."</Text>
          </View>
          <Switch
            value={showSearchPrefEnabled}
            onValueChange={(val) => showSearchPrefMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={showSearchPrefEnabled ? Colors.text : Colors.textSecondary}
            disabled={showSearchPrefMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {showSearchPrefEnabled ? t("admin.searchMatchVisible") : t("admin.searchMatchHidden")}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="refresh" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Aggiorna Coordinate (sec)</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TextInput
              style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, width: 70, color: Colors.text, fontSize: 14, textAlign: "center", backgroundColor: Colors.surface }}
              keyboardType="numeric"
              value={refetchIntervalInput}
              onChangeText={setRefetchIntervalInput}
              onEndEditing={() => {
                const val = parseInt(refetchIntervalInput, 10);
                if (!isNaN(val) && val >= 5) {
                  refetchIntervalMutation.mutate(String(val));
                } else {
                  setRefetchIntervalInput(String(refetchIntervalData?.seconds ?? 30));
                }
              }}
            />
          </View>
        </View>
        <Text style={styles.synecoDesc}>
          Ogni quanti secondi i client aggiornano le proprie coordinate nella tab Match (min 5s, default 30s)
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="time" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>{t("admin.maxCoordAge")}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TextInput
              style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, width: 70, color: Colors.text, fontSize: 14, textAlign: "center", backgroundColor: Colors.surface }}
              keyboardType="numeric"
              value={coordMaxAgeInput}
              onChangeText={setCoordMaxAgeInput}
              onEndEditing={() => {
                const val = parseInt(coordMaxAgeInput, 10);
                if (!isNaN(val) && val >= 10) {
                  coordMaxAgeMutation.mutate(String(val));
                } else {
                  setCoordMaxAgeInput(String(coordMaxAgeData?.value ?? 300));
                }
              }}
            />
          </View>
        </View>
        <Text style={styles.synecoDesc}>
          {t("admin.coordAgeDesc")}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="people" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Creazione Club da Utenti</Text>
          </View>
          <Switch
            value={motoclubCreationEnabled}
            onValueChange={(val) => motoclubCreationMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={motoclubCreationEnabled ? Colors.text : Colors.textSecondary}
            disabled={motoclubCreationMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {motoclubCreationEnabled ? "Gli utenti possono richiedere la creazione di nuovi motoclub" : "Creazione motoclub da utenti disabilitata"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="bar-chart" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Status Matching</Text>
          </View>
          <TouchableOpacity
            onPress={() => matchingTriggerMutation.mutate()}
            disabled={matchingTriggerMutation.isPending}
            style={[styles.triggerBtn, matchingTriggerMutation.isPending && { opacity: 0.5 }]}
          >
            {matchingTriggerMutation.isPending
              ? <ActivityIndicator size="small" color={Colors.text} />
              : <Text style={styles.triggerBtnText}>Esegui Ora</Text>}
          </TouchableOpacity>
        </View>
        <View style={styles.matchingStatsRow}>
          <View style={styles.matchingStatItem}>
            <Text style={styles.matchingStatValue}>{matchingStats?.totalZavarrinaMatches ?? "—"}</Text>
            <Text style={styles.matchingStatLabel}>Match Garage</Text>
          </View>
          <View style={styles.matchingStatDivider} />
          <View style={styles.matchingStatItem}>
            <Text style={styles.matchingStatValue}>{matchingStats?.totalBikerBikerMatches ?? "—"}</Text>
            <Text style={styles.matchingStatLabel}>Match Biker</Text>
          </View>
        </View>
        {matchingStats?.lastCycle ? (
          <View style={styles.lastCycleBox}>
            <Text style={styles.lastCycleTitle}>Ultimo ciclo</Text>
            <Text style={styles.lastCycleText}>
              {new Date(matchingStats.lastCycle.completedAt).toLocaleString("it-IT")}
              {"  ·  "}{Math.round(matchingStats.lastCycle.durationMs / 1000)}s
            </Text>
            <Text style={styles.lastCycleText}>
              +{matchingStats.lastCycle.zavarrinaMatchesNew} garage  ·  +{matchingStats.lastCycle.bikerBikerMatchesNew} biker
            </Text>
          </View>
        ) : (
          <Text style={styles.synecoDesc}>Nessun ciclo eseguito in questa sessione</Text>
        )}
        {matchingTriggerFeedback && (
          <Text style={[styles.synecoDesc, { color: Colors.warning, marginTop: 6 }]}>{matchingTriggerFeedback}</Text>
        )}
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="flag" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Paesi Matching</Text>
          </View>
          {matchingCountriesMutation.isPending && <ActivityIndicator size="small" color={Colors.warning} />}
        </View>
        <Text style={styles.synecoDesc}>
          {matchingCountries.length === 0
            ? t("admin.allCountries")
            : `${matchingCountries.length} ${matchingCountries.length === 1 ? "paese selezionato" : "paesi selezionati"}`}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginBottom: 8 }}>
          {sortedMatchingCountries.map((c) => {
            const isSelected = matchingCountries.includes(c.code);
            return (
              <TouchableOpacity
                key={c.code}
                onPress={() => {
                  setMatchingCountries((prev) =>
                    prev.includes(c.code) ? prev.filter((x) => x !== c.code) : [...prev, c.code]
                  );
                }}
                style={[styles.countryChip, isSelected && styles.countryChipSelected]}
              >
                <Text style={styles.countryChipFlag}>{c.flag}</Text>
                <Text style={[styles.countryChipText, isSelected && styles.countryChipTextSelected]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity
          style={[styles.saveBtn, { alignSelf: "flex-end", marginTop: 4 }]}
          onPress={() => matchingCountriesMutation.mutate(matchingCountries)}
          disabled={matchingCountriesMutation.isPending}
        >
          <Text style={styles.saveBtnText}>Salva Paesi</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="bicycle" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Inviti Club dal Garage</Text>
          </View>
          {reconcileClubInvitesMutation.isPending && <ActivityIndicator size="small" color={Colors.warning} />}
        </View>
        <Text style={styles.synecoDesc}>
          Ricrea inviti ai brand club per le moto nel tuo garage che non hanno ancora un invito o iscrizione.
        </Text>
        <TouchableOpacity
          style={[styles.saveBtn, { alignSelf: "flex-start", marginTop: 10 }]}
          onPress={() => {
            setClubInviteFeedback(null);
            reconcileClubInvitesMutation.mutate();
          }}
          disabled={reconcileClubInvitesMutation.isPending}
        >
          <Text style={styles.saveBtnText}>Ricrea inviti club</Text>
        </TouchableOpacity>
        {clubInviteFeedback && (
          <Text style={[styles.synecoDesc, { color: Colors.warning, marginTop: 6 }]}>{clubInviteFeedback}</Text>
        )}
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="map" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Percorsi Personalizzati</Text>
          </View>
          <Switch
            value={customRoutesEnabled}
            onValueChange={(val) => customRoutesMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={customRoutesEnabled ? Colors.text : Colors.textSecondary}
            disabled={customRoutesMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {customRoutesEnabled ? "Gli utenti possono creare percorsi personalizzati" : "I percorsi personalizzati sono disattivati"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="people-circle" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Zavorrine nei Club</Text>
          </View>
          <Switch
            value={motoclubZavEnabled}
            onValueChange={(val) => motoclubZavMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={motoclubZavEnabled ? Colors.text : Colors.textSecondary}
            disabled={motoclubZavMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {motoclubZavEnabled
            ? "Le zavorrine ricevono invite ai motoclub in base alle moto nella wishlist"
            : "Le zavorrine non sono incluse nei motoclub (iscrizioni e inviti esistenti rimossi)"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="musical-notes" size={20} color={Colors.warning} />
            <Text style={styles.synecoLabel}>Music Match</Text>
          </View>
          <Switch
            value={musicMatchEnabled}
            onValueChange={(val) => musicMatchMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor={musicMatchEnabled ? Colors.text : Colors.textSecondary}
            disabled={musicMatchMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {musicMatchEnabled ? t("admin.musicMatchActive") : t("admin.musicMatchInactive")}
        </Text>
      </View>
          </View>
        )}
      </View>

      <View style={styles.accordionPanel}>
        <Pressable style={styles.accordionPanelHeader} onPress={() => setCoordHistoryExpanded((v) => !v)}>
          <View style={styles.synecoInfo}>
            <Ionicons name="navigate" size={20} color={Colors.accent} />
            <Text style={styles.accordionPanelTitle}>Storico Coordinate</Text>
          </View>
          <Ionicons name={coordHistoryExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </Pressable>
        {coordHistoryExpanded && (
          <View style={styles.accordionPanelContent}>
            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="power" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>Tracciamento Attivo</Text>
                </View>
                <Switch
                  value={coordHistorySettings?.enabled === true}
                  onValueChange={(val) => coordHistoryMutation.mutate({ enabled: val })}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                  thumbColor={coordHistorySettings?.enabled ? Colors.text : Colors.textSecondary}
                  disabled={coordHistoryMutation.isPending}
                />
              </View>
              <Text style={styles.synecoDesc}>
                {coordHistorySettings?.enabled ? t("admin.coordHistoryActive") : t("admin.coordHistoryInactive")}
              </Text>
            </View>

            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="timer" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>Intervallo Salvataggio (sec)</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, width: 70, color: Colors.text, fontSize: 14, textAlign: "center", backgroundColor: Colors.surface }}
                    keyboardType="numeric"
                    value={chIntervalInput}
                    onChangeText={setChIntervalInput}
                    onEndEditing={() => {
                      const val = parseInt(chIntervalInput, 10);
                      if (!isNaN(val) && val >= 5) {
                        coordHistoryMutation.mutate({ interval: val });
                      } else {
                        setChIntervalInput(String(coordHistorySettings?.interval ?? 30));
                      }
                    }}
                  />
                </View>
              </View>
              <Text style={styles.synecoDesc}>
                Ogni quanti secondi salvare le coordinate nella history (min 5s, default 30s)
              </Text>
            </View>

            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="albums" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>Max Record per Utente</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, width: 70, color: Colors.text, fontSize: 14, textAlign: "center", backgroundColor: Colors.surface }}
                    keyboardType="numeric"
                    value={chMaxRecordsInput}
                    onChangeText={setChMaxRecordsInput}
                    onEndEditing={() => {
                      const val = parseInt(chMaxRecordsInput, 10);
                      if (!isNaN(val) && val >= 1) {
                        coordHistoryMutation.mutate({ maxRecords: val });
                      } else {
                        setChMaxRecordsInput(String(coordHistorySettings?.maxRecords ?? 60));
                      }
                    }}
                  />
                </View>
              </View>
              <Text style={styles.synecoDesc}>
                {t("admin.maxRecordsPerUser")}
              </Text>
            </View>

            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="people" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>{t("admin.adModeLabel")}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["all", "selected"] as const).map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => coordHistoryMutation.mutate({ mode: m })}
                      style={[
                        styles.countryChip,
                        coordHistorySettings?.mode === m && styles.countryChipSelected,
                      ]}
                    >
                      <Text style={[
                        styles.countryChipText,
                        coordHistorySettings?.mode === m && styles.countryChipTextSelected,
                      ]}>
                        {m === "all" ? "Tutti" : "Selezionati"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <Text style={styles.synecoDesc}>
                {coordHistorySettings?.mode === "selected"
                  ? `Tracciamento attivo solo per ${coordHistorySettings?.selectedUsers?.length ?? 0} utenti selezionati`
                  : "Tracciamento attivo per tutti gli utenti"}
              </Text>
            </View>

            {coordHistorySettings?.mode === "selected" && (
              <View style={styles.paidCard}>
                <View style={styles.synecoHeader}>
                  <View style={styles.synecoInfo}>
                    <Ionicons name="person-add" size={20} color={Colors.accent} />
                    <Text style={styles.synecoLabel}>Utenti Selezionati ({coordHistorySettings?.selectedUsers?.length ?? 0})</Text>
                  </View>
                </View>
                {(coordHistorySettings?.selectedUsers?.length ?? 0) > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {coordHistorySettings!.selectedUsers.map((uid) => (
                      <TouchableOpacity
                        key={uid}
                        onPress={() => {
                          const updated = coordHistorySettings!.selectedUsers.filter((u) => u !== uid);
                          coordHistoryMutation.mutate({ selectedUsers: updated });
                        }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: Colors.accent }}
                      >
                        <Text style={{ color: "#fff", fontSize: 12 }}>{uid.slice(0, 8)}...</Text>
                        <Ionicons name="close-circle" size={14} color="#fff" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <TextInput
                  style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: Colors.text, fontSize: 14, backgroundColor: Colors.surface, marginTop: 10 }}
                  placeholder="Cerca utente per nickname..."
                  placeholderTextColor={Colors.textSecondary}
                  value={chUserSearch}
                  onChangeText={setChUserSearch}
                />
                {chSearchResults && chSearchResults.length > 0 && (
                  <View style={{ marginTop: 6, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, backgroundColor: Colors.surface, maxHeight: 180 }}>
                    <ScrollView nestedScrollEnabled>
                      {chSearchResults
                        .filter((u) => !(coordHistorySettings?.selectedUsers ?? []).includes(u.id))
                        .map((u) => (
                          <TouchableOpacity
                            key={u.id}
                            onPress={() => {
                              const current = coordHistorySettings?.selectedUsers ?? [];
                              coordHistoryMutation.mutate({ selectedUsers: [...current, u.id] });
                              setChUserSearch("");
                            }}
                            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}
                          >
                            <Ionicons name="add-circle" size={18} color={Colors.accent} />
                            <Text style={{ color: Colors.text, fontSize: 14, flex: 1 }}>{u.nickname}</Text>
                            <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>{u.userType}</Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                )}
                {chUserSearch.length >= 2 && chSearchResults && chSearchResults.filter((u) => !(coordHistorySettings?.selectedUsers ?? []).includes(u.id)).length === 0 && (
                  <Text style={[styles.synecoDesc, { marginTop: 6 }]}>Nessun utente trovato</Text>
                )}
              </View>
            )}

            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="stats-chart" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>Statistiche</Text>
                </View>
              </View>
              <View style={styles.matchingStatsRow}>
                <View style={styles.matchingStatItem}>
                  <Text style={styles.matchingStatValue}>{coordHistoryStats?.totalRecords ?? "—"}</Text>
                  <Text style={styles.matchingStatLabel}>Record Totali</Text>
                </View>
                <View style={styles.matchingStatDivider} />
                <View style={styles.matchingStatItem}>
                  <Text style={styles.matchingStatValue}>{coordHistoryStats?.trackedUsers ?? "—"}</Text>
                  <Text style={styles.matchingStatLabel}>Utenti Tracciati</Text>
                </View>
              </View>
              {(coordHistoryStats?.oldestRecord || coordHistoryStats?.newestRecord) && (
                <View style={styles.lastCycleBox}>
                  {coordHistoryStats.oldestRecord && (
                    <Text style={styles.lastCycleText}>
                      Primo: {new Date(coordHistoryStats.oldestRecord).toLocaleString("it-IT")}
                    </Text>
                  )}
                  {coordHistoryStats.newestRecord && (
                    <Text style={styles.lastCycleText}>
                      Ultimo: {new Date(coordHistoryStats.newestRecord).toLocaleString("it-IT")}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      <View style={styles.accordionPanel}>
        <Pressable style={styles.accordionPanelHeader} onPress={() => setBgLocationExpanded((v) => !v)}>
          <View style={styles.synecoInfo}>
            <Ionicons name="location" size={20} color={Colors.accent} />
            <Text style={styles.accordionPanelTitle}>Background Location</Text>
          </View>
          <Ionicons name={bgLocationExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </Pressable>
        {bgLocationExpanded && (
          <View style={styles.accordionPanelContent}>
            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="power" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>Attivo Globalmente</Text>
                </View>
                <Switch
                  value={bgLocationSettings?.enabled !== false}
                  onValueChange={(val) => bgLocationMutation.mutate({ enabled: val })}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                  thumbColor={bgLocationSettings?.enabled !== false ? Colors.text : Colors.textSecondary}
                  disabled={bgLocationMutation.isPending}
                />
              </View>
              <Text style={styles.synecoDesc}>
                {bgLocationSettings?.enabled !== false
                  ? t("admin.bgTrackingActive")
                  : t("admin.bgTrackingInactive")}
              </Text>
            </View>

            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="git-branch" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>{t("admin.triggerMode")}</Text>
                </View>
              </View>
              <Text style={styles.synecoDesc}>Quando inviare la posizione in background:</Text>
              {[
                { value: "always", label: t("admin.alwaysSend"), desc: t("admin.alwaysSendDesc") },
                { value: "tracking", label: "Solo tracking attivo", desc: "Solo durante la registrazione di un percorso" },
                { value: "sos", label: "Solo SOS attivo", desc: "Solo durante un'emergenza SOS" },
                { value: "tracking_or_sos", label: "Tracking O SOS", desc: t("admin.trackingOrSosDesc") },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => bgLocationMutation.mutate({ trigger: opt.value })}
                  style={[
                    bgLocationStyles.triggerOption,
                    bgLocationSettings?.trigger === opt.value && bgLocationStyles.triggerOptionActive,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[bgLocationStyles.triggerLabel, bgLocationSettings?.trigger === opt.value && bgLocationStyles.triggerLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.synecoDesc}>{opt.desc}</Text>
                  </View>
                  {bgLocationSettings?.trigger === opt.value && (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="timer" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>Intervallo (secondi)</Text>
                </View>
              </View>
              <Text style={styles.synecoDesc}>Frequenza di invio posizione (min 10s, max 300s):</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
                <TextInput
                  style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: Colors.text, fontSize: 14, backgroundColor: Colors.surface }}
                  value={bgIntervalInput}
                  onChangeText={setBgIntervalInput}
                  keyboardType="number-pad"
                  placeholder="30"
                  placeholderTextColor={Colors.textSecondary}
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={() => {
                    const val = parseInt(bgIntervalInput, 10);
                    if (isNaN(val) || val < 10 || val > 300) {
                      Alert.alert(t("common.error"), t("admin.valueBetween10and300"));
                      return;
                    }
                    bgLocationMutation.mutate({ intervalSeconds: val });
                  }}
                  disabled={bgLocationMutation.isPending}
                >
                  <Text style={styles.saveBtnText}>Salva</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="notifications" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>Testo Notifica Persistente</Text>
                </View>
              </View>
              <Text style={styles.synecoDesc}>
                Usa {"{motivo}"} come placeholder dinamico (es. "tracking percorso", "SOS attivo", "monitoraggio generale"):
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: Colors.text, fontSize: 14, backgroundColor: Colors.surface, marginTop: 10, height: 70, textAlignVertical: "top" }}
                value={bgNotificationTextInput}
                onChangeText={setBgNotificationTextInput}
                multiline
                placeholder="BikerLink: {motivo} — posizione attiva in background"
                placeholderTextColor={Colors.textSecondary}
              />
              <TouchableOpacity
                style={[styles.saveBtn, { alignSelf: "flex-end", marginTop: 8 }]}
                onPress={() => bgLocationMutation.mutate({ notificationText: bgNotificationTextInput })}
                disabled={bgLocationMutation.isPending}
              >
                <Text style={styles.saveBtnText}>Salva Testo</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.paidCard}>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="eye-off" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>Continua con Ghost Mode</Text>
                </View>
                <Switch
                  value={bgLocationSettings?.ghostModeContinue === true}
                  onValueChange={(val) => bgLocationMutation.mutate({ ghostModeContinue: val })}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                  thumbColor={bgLocationSettings?.ghostModeContinue ? Colors.text : Colors.textSecondary}
                  disabled={bgLocationMutation.isPending}
                />
              </View>
              <Text style={styles.synecoDesc}>
                {bgLocationSettings?.ghostModeContinue
                  ? t("admin.ghostBgTracking")
                  : "Il background location si interrompe quando l'utente attiva Ghost Mode"}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="warning" size={20} color="#FF6600" />
            <Text style={styles.synecoLabel}>SOS Biker</Text>
          </View>
          <Switch
            value={sosEnabled}
            onValueChange={(val) => sosMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: "#FF6600" }}
            thumbColor={sosEnabled ? Colors.text : Colors.textSecondary}
            disabled={sosMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {sosEnabled ? t("admin.sosActive") : t("admin.sosInactive")}
        </Text>
      </View>

      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="phone-portrait-outline" size={20} color={phoneSensorsEnabled ? Colors.accentRed : Colors.textSecondary} />
            <Text style={styles.synecoLabel}>Sensori Telefono (G-force)</Text>
          </View>
          <Switch
            value={phoneSensorsEnabled}
            onValueChange={(val) => phoneSensorsMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.accentRed + "80" }}
            thumbColor={phoneSensorsEnabled ? Colors.accentRed : Colors.textSecondary}
            disabled={phoneSensorsMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {phoneSensorsEnabled
            ? t("admin.gforceBetaVisible")
            : t("admin.gforceBetaHidden")}
        </Text>
      </View>

      <View style={styles.accordionPanel}>
        <Pressable style={styles.accordionPanelHeader} onPress={() => setMusicSystemExpanded((v) => !v)}>
          <View style={styles.synecoInfo}>
            <Ionicons name="musical-notes" size={20} color="#1DB954" />
            <Text style={styles.accordionPanelTitle}>Music System</Text>
          </View>
          <Ionicons name={musicSystemExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </Pressable>
        {musicSystemExpanded && (
          <View style={styles.accordionPanelContent}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="share-outline" size={20} color="#1DB954" />
                <Text style={styles.synecoLabel}>Consenti export playlist</Text>
              </View>
              <Switch
                value={musicExportEnabled}
                onValueChange={(val) => musicExportMutation.mutate(val)}
                trackColor={{ false: Colors.border, true: "#1DB954" }}
                thumbColor={musicExportEnabled ? Colors.text : Colors.textSecondary}
                disabled={musicExportMutation.isPending}
              />
            </View>
            <Text style={styles.synecoDesc}>
              {musicExportEnabled ? "Gli utenti possono esportare la propria playlist" : "Export playlist disabilitato"}
            </Text>
            <View style={[styles.synecoHeader, { marginTop: 12 }]}>
              <View style={styles.synecoInfo}>
                <Ionicons name="download-outline" size={20} color="#1DB954" />
                <Text style={styles.synecoLabel}>Consenti import playlist</Text>
              </View>
              <Switch
                value={musicImportEnabled}
                onValueChange={(val) => musicImportMutation.mutate(val)}
                trackColor={{ false: Colors.border, true: "#1DB954" }}
                thumbColor={musicImportEnabled ? Colors.text : Colors.textSecondary}
                disabled={musicImportMutation.isPending}
              />
            </View>
            <Text style={styles.synecoDesc}>
              {musicImportEnabled ? "Gli utenti possono importare playlist" : "Import playlist disabilitato"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.accordionPanel}>
        <Pressable style={styles.accordionPanelHeader} onPress={() => setMapsExpanded((v) => !v)}>
          <View style={styles.synecoInfo}>
            <Ionicons name="map" size={20} color={Colors.accent} />
            <Text style={styles.accordionPanelTitle}>Stile Mappa</Text>
          </View>
          <Ionicons name={mapsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </Pressable>
        {mapsExpanded && (
          <View style={styles.accordionPanelContent}>
            <View style={styles.synecoHeader}>
              <View style={styles.synecoInfo}>
                <Ionicons name="map" size={20} color={Colors.accent} />
                <Text style={styles.synecoLabel}>Sistema Mappe</Text>
          </View>
          <Switch
            value={mapsEnabled}
            onValueChange={(val) => mapsEnabledMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={mapsEnabled ? Colors.text : Colors.textSecondary}
            disabled={mapsEnabledMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {mapsEnabled ? t("admin.tileMapActive") : t("admin.tileMapInactive")}
        </Text>
        {mapsEnabled && (
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.synecoDesc, { marginBottom: 6 }]}>Provider tile default (globale):</Text>
            {(() => {
              const providerLabels: Record<string, string> = {
                esri_gray: "Base Map",
                carto_light: "Mappa Dettagliata Light & Dark",
                carto_dark: "FullMap",
              };
              return (
                <>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => setShowProviderDropdown(true)}
                    disabled={mapsProviderMutation.isPending}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dropdownButtonText}>
                      {providerLabels[mapsProvider] ?? mapsProvider}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <Modal
                    visible={showProviderDropdown}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowProviderDropdown(false)}
                  >
                    <TouchableOpacity
                      style={styles.dropdownOverlay}
                      activeOpacity={1}
                      onPress={() => setShowProviderDropdown(false)}
                    >
                      <View style={styles.dropdownMenu}>
                        {(["esri_gray", "carto_light", "carto_dark"] as const).map((p) => (
                          <TouchableOpacity
                            key={p}
                            style={[
                              styles.dropdownMenuItem,
                              mapsProvider === p && styles.dropdownMenuItemActive,
                            ]}
                            onPress={() => {
                              setShowProviderDropdown(false);
                              mapsProviderMutation.mutate(p);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.dropdownMenuItemText, mapsProvider === p && { color: Colors.accent }]}>
                              {providerLabels[p]}
                            </Text>
                            {mapsProvider === p && (
                              <Ionicons name="checkmark" size={16} color={Colors.accent} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </TouchableOpacity>
                  </Modal>
                </>
              );
            })()}
          </View>
        )}
        <View style={[styles.synecoHeader, { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.border }]}>
          <View style={styles.synecoInfo}>
            <Ionicons name="person-circle-outline" size={18} color={Colors.textSecondary} />
            <Text style={[styles.synecoDesc, { marginBottom: 0 }]}>Scelta stile utente</Text>
          </View>
          <Switch
            value={mapsUserChoiceEnabled}
            onValueChange={(val) => mapsUserChoiceMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={mapsUserChoiceEnabled ? Colors.text : Colors.textSecondary}
            disabled={mapsUserChoiceMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {mapsUserChoiceEnabled
            ? "Gli utenti possono scegliere il proprio stile mappa"
            : t("admin.allProviders")}
        </Text>
          </View>
        )}
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="megaphone-outline" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Messaggio Home</Text>
          </View>
          <Switch
            value={homeMessageEnabled}
            onValueChange={(val) => homeMessageToggleMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={homeMessageEnabled ? Colors.text : Colors.textSecondary}
            disabled={homeMessageToggleMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {homeMessageEnabled
            ? t("admin.logoMsgActive")
            : t("admin.logoMsgInactive")}
        </Text>
        <View style={{ marginTop: 14 }}>
          <TextInput
            style={[styles.input, { minHeight: 100 }]}
            placeholder="Inserisci il messaggio da mostrare agli utenti..."
            placeholderTextColor={Colors.textSecondary}
            value={homeMessageText}
            onChangeText={setHomeMessageText}
            multiline
            numberOfLines={4}
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveHomeMessageText}
              disabled={isSavingHomeMessage}
            >
              <Text style={styles.saveBtnText}>{isSavingHomeMessage ? "..." : t("admin.saveBtn")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.paypalCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="pricetag" size={20} color="#FF9800" />
            <Text style={styles.synecoLabel}>Mercatino Moto</Text>
          </View>
          {marketplaceData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={marketplaceEnabled}
              onValueChange={(val) => setProtectedToggle({ key: "marketplace_enabled", value: val, label: "Mercatino Moto" })}
              trackColor={{ false: Colors.border, true: "#FF9800" }}
              thumbColor={marketplaceEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {marketplaceEnabled
            ? "I biker possono mettere in vendita le moto dal garage. Le moto in vendita appaiono nel profilo e nel motoclub."
            : t("admin.marketplaceInactive")}
        </Text>
      </View>

      <View style={styles.paypalCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="navigate" size={20} color="#4CAF50" />
            <Text style={styles.synecoLabel}>GPS Obbligatorio</Text>
          </View>
          {gpsRequiredData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={gpsRequired}
              onValueChange={(val) => setProtectedToggle({ key: "gps_required", value: val, label: "GPS Obbligatorio" })}
              trackColor={{ false: Colors.border, true: "#4CAF50" }}
              thumbColor={gpsRequired ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {gpsRequired
            ? "Senza permesso GPS, l'utente vede solo Profilo e Garage. Le altre tab sono nascoste."
            : "GPS non obbligatorio: tutte le tab sono sempre visibili, anche senza permesso di localizzazione."}
        </Text>
      </View>

      <View style={styles.paypalCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="eye-off" size={20} color="#9C27B0" />
            <Text style={styles.synecoLabel}>Ghost Mode</Text>
          </View>
          {ghostModeData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={ghostModeEnabled}
              onValueChange={(val) => setProtectedToggle({ key: "ghost_mode_enabled", value: val, label: "Ghost Mode" })}
              trackColor={{ false: Colors.border, true: "#9C27B0" }}
              thumbColor={ghostModeEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {ghostModeEnabled
            ? t("admin.invisibleModeDesc")
            : "Ghost Mode disabilitato. Gli utenti non possono nascondersi dalla piattaforma."}
        </Text>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="people" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Gestione Utenti</Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="mail" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Verifica Email</Text>
            <TouchableOpacity
              onPress={() => Alert.alert(
                "Verifica Email - Info",
                "Quando attiva:\n\n" +
                "1. Ogni nuovo utente riceve un codice di verifica a 6 cifre\n" +
                "2. L'utente deve inserire il codice nella schermata di verifica per completare la registrazione\n" +
                "3. Il codice scade dopo 30 minuti\n" +
                t("admin.emailVerifStep4") + "\n" +
                "5. L'admin riceve una notifica con il codice generato\n" +
                t("admin.emailVerifStep6")
              )}
              style={{ marginLeft: 6 }}
            >
              <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {emailVerifData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={emailVerifEnabled}
              onValueChange={(val) => setProtectedToggle({ key: "email_verification_enabled", value: val, label: "Verifica Email" })}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={emailVerifEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {emailVerifEnabled ? t("admin.emailVerifActive") : t("admin.emailVerifInactive")}
        </Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="call-outline" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Campo telefono in registrazione</Text>
          </View>
          {phoneFieldData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={phoneFieldEnabled}
              onValueChange={(val) => setProtectedToggle({ key: "phone_field_enabled", value: val, label: "Campo telefono in registrazione" })}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={phoneFieldEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {phoneFieldEnabled ? t("admin.phoneFieldVisible") : t("admin.phoneFieldHidden")}
        </Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="radio-button-on-outline" size={20} color={Colors.success} />
            <Text style={styles.synecoLabel}>Utente Disponibile all'accesso</Text>
          </View>
          {userAvailableData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={userAvailableOnLogin}
              onValueChange={(val) => setProtectedToggle({ key: "user_available_on_login", value: val, label: "Utente Disponibile all'accesso" })}
              trackColor={{ false: Colors.border, true: Colors.success }}
              thumbColor={userAvailableOnLogin ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {userAvailableOnLogin ? "Gli utenti risultano disponibili appena effettuato il login" : "Gli utenti risultano non disponibili al login (devono attivarsi manualmente)"}
        </Text>
      </View>

      <View style={styles.emailVerifCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="star" size={20} color="#FF3B30" />
            <Text style={[styles.synecoLabel, { color: "#FF3B30" }]}>Primal User</Text>
          </View>
          <Switch
            value={primalEnabled}
            onValueChange={(val) => primalMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: "#FF3B30" }}
            thumbColor={primalEnabled ? Colors.text : Colors.textSecondary}
            disabled={primalMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {primalEnabled ? t("admin.primalActive") : t("admin.primalInactive")}
        </Text>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="cash" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Monetizzazione</Text>
      </View>

      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="volume-high" size={20} color={Colors.syneco} />
            <Text style={styles.synecoLabel}>Advertisement</Text>
          </View>
          {adsEnabledData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={adsEnabled}
              onValueChange={(val) => {
                if (!val) {
                  disableFeatureMutation.mutate("ads_enabled");
                } else {
                  setProtectedToggle({ key: "ads_enabled", value: val, label: "Advertisement" });
                }
              }}
              trackColor={{ false: Colors.border, true: Colors.syneco }}
              thumbColor={adsEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending || disableFeatureMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {adsEnabled ? "Gli advertisement sono attivi nell'app" : "Gli advertisement sono disattivati"}
        </Text>
      </View>

      <View style={styles.synecoCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="megaphone" size={20} color={Colors.syneco} />
            <Text style={styles.synecoLabel}>Branding Syneco</Text>
          </View>
          {synecoData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={synecoVisible}
              onValueChange={(val) => {
                if (!val) {
                  disableFeatureMutation.mutate("syneco_branding_visible");
                } else {
                  setProtectedToggle({ key: "syneco_branding_visible", value: val, label: "Branding Syneco" });
                }
              }}
              trackColor={{ false: Colors.border, true: Colors.syneco }}
              thumbColor={synecoVisible ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending || disableFeatureMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {synecoVisible ? t("admin.synecoVisible") : t("admin.synecoHidden")}
        </Text>
      </View>

      <View style={styles.paypalCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="heart" size={20} color="#E91E63" />
            <Text style={styles.synecoLabel}>Supporto economico</Text>
          </View>
          {donationData === undefined ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={donationEnabled}
              onValueChange={(val) => setProtectedToggle({ key: "donation_enabled", value: val, label: "Supporto economico" })}
              trackColor={{ false: Colors.border, true: "#E91E63" }}
              thumbColor={donationEnabled ? Colors.text : Colors.textSecondary}
              disabled={protectedToggleMutation.isPending}
            />
          )}
        </View>
        <Text style={styles.synecoDesc}>
          {donationEnabled
            ? t("admin.supportBlockVisible")
            : t("admin.supportBlockHidden")}
        </Text>

        <View style={{ marginTop: 16 }}>
          <Text style={styles.settingLabel}>Email supporto</Text>
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="email@esempio.com"
            placeholderTextColor={Colors.textSecondary}
            value={paypalEmail}
            onChangeText={setPaypalEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSavePaypal}
              disabled={isSavingPaypal}
            >
              <Text style={styles.saveBtnText}>{isSavingPaypal ? "..." : t("admin.saveBtn")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <Text style={styles.settingLabel}>Testo Messaggio Donazione</Text>
          <Text style={[styles.synecoDesc, { marginTop: 2, marginBottom: 8 }]}>
            Se vuoto, viene usato il testo predefinito.
          </Text>
          <TextInput
            style={[styles.input, { minHeight: 120 }]}
            placeholder={t("admin.donationPlaceholder")}
            placeholderTextColor={Colors.textSecondary}
            value={donationText}
            onChangeText={setDonationText}
            multiline
            numberOfLines={6}
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => {
                setDonationTextPassword("");
                setShowDonationTextPasswordModal(true);
              }}
            >
              <Text style={styles.saveBtnText}>Salva</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.accordionPanel}>
        <Pressable style={styles.accordionPanelHeader} onPress={() => setDocsExpanded((v) => !v)}>
          <View style={styles.synecoInfo}>
            <Ionicons name="book" size={20} color={Colors.accent} />
            <Text style={styles.accordionPanelTitle}>Documenti PDF</Text>
          </View>
          <Ionicons name={docsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </Pressable>
        {docsExpanded && (
          <View style={styles.accordionPanelContent}>
            <ManualAdminSection />

            <PdfDocumentAdminSection
              title="EULA"
              fileName="BikerLink-EULA.pdf"
              infoEndpoint="/api/eula/info"
              downloadEndpoint="/api/eula/download"
              uploadEndpoint="/api/admin/eula/upload"
            />

            <PdfDocumentAdminSection
              title="Privacy Policy"
              fileName="BikerLink-PrivacyPolicy.pdf"
              infoEndpoint="/api/privacy-policy/info"
              downloadEndpoint="/api/privacy-policy/download"
              uploadEndpoint="/api/admin/privacy-policy/upload"
            />
          </View>
        )}
      </View>

      <View style={styles.accordionPanel}>
        <Pressable style={styles.accordionPanelHeader} onPress={() => setFloatingWidgetExpanded((v) => !v)}>
          <View style={styles.synecoInfo}>
            <Ionicons name="radio-button-on" size={20} color={Colors.accent} />
            <Text style={styles.accordionPanelTitle}>Widget Flottante</Text>
          </View>
          <Ionicons name={floatingWidgetExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
        </Pressable>
        {floatingWidgetExpanded && (
          <View style={styles.accordionPanelContent}>
            <View style={styles.paidCard}>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 14, lineHeight: 18 }}>
                {t("admin.floatingWidgetDesc")}
              </Text>
              <View style={styles.synecoHeader}>
                <View style={styles.synecoInfo}>
                  <Ionicons name="radio-button-on" size={20} color={Colors.accent} />
                  <Text style={styles.synecoLabel}>Widget abilitato globalmente</Text>
                </View>
                <Switch
                  value={floatingWidgetEnabled}
                  onValueChange={(val) => setProtectedToggle({ key: "floating_widget_enabled", value: val, label: "Widget Flottante" })}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                  thumbColor="#fff"
                  disabled={protectedToggleMutation.isPending}
                />
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={styles.paypalCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="speedometer-outline" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>{t("admin.unitPrefsLabel")}</Text>
          </View>
          <Switch
            value={unitsPrefEnabled}
            onValueChange={(val) => setProtectedToggle({ key: "units_preference_enabled", value: val, label: t("admin.unitPrefsLabel") })}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={unitsPrefEnabled ? Colors.text : Colors.textSecondary}
            disabled={protectedToggleMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {unitsPrefEnabled
            ? t("admin.unitPrefVisible")
            : t("admin.unitPrefsHidden")}
        </Text>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="construct" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Configurazione Tecnica</Text>
      </View>

      <View style={styles.emailSmtpCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="send" size={20} color="#4285F4" />
            <Text style={styles.synecoLabel}>Email SMTP (Gmail)</Text>
            <TouchableOpacity
              onPress={() => Alert.alert(
                "Configurazione Email SMTP",
                "Per inviare email dall'app (verifica email, notifiche) serve un account Gmail configurato.\n\n" +
                "Come configurare:\n" +
                "1. Crea un account Gmail dedicato\n" +
                "2. Vai su myaccount.google.com → Sicurezza\n" +
                "3. Attiva la verifica in due passaggi\n" +
                "4. Vai su 'Password per le app'\n" +
                "5. Crea una nuova password per 'Posta'\n" +
                "6. Inserisci qui l'indirizzo Gmail e la password generata\n\n" +
                "La modifica richiede la password admin per sicurezza."
              )}
              style={{ marginLeft: 6 }}
            >
              <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 }}>
          <View style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: emailConfigData?.configured ? "#4CAF50" : "#F44336",
          }} />
          <Text style={styles.synecoDesc}>
            {emailConfigData?.configured
              ? `Configurato: ${emailConfigData.maskedEmail}`
              : "Non configurato — le email non verranno inviate"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }]}
          onPress={() => setEmailConfigModalVisible(true)}
        >
          <Ionicons name="lock-closed" size={16} color={Colors.background} />
          <Text style={styles.saveBtnText}>Modifica</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={emailConfigModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailConfigModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configura Email SMTP</Text>
            <Text style={styles.modalSubtitle}>Inserisci la password admin per sbloccare la modifica</Text>

            <Text style={styles.modalFieldLabel}>Password Admin</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="La tua password admin"
              placeholderTextColor={Colors.textSecondary}
              value={emailConfigAdminPass}
              onChangeText={setEmailConfigAdminPass}
              secureTextEntry
            />

            <Text style={styles.modalFieldLabel}>Indirizzo Gmail</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={emailConfigData?.maskedEmail || "esempio@gmail.com"}
              placeholderTextColor={Colors.textSecondary}
              value={emailConfigGmail}
              onChangeText={setEmailConfigGmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.modalFieldLabel}>Password per le App</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="xxxx xxxx xxxx xxxx"
              placeholderTextColor={Colors.textSecondary}
              value={emailConfigAppPass}
              onChangeText={setEmailConfigAppPass}
              secureTextEntry
            />

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setEmailConfigModalVisible(false);
                  setEmailConfigAdminPass("");
                  setEmailConfigGmail("");
                  setEmailConfigAppPass("");
                }}
              >
                <Text style={styles.cancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveEmailConfig}
                disabled={isSavingEmailConfig}
              >
                <Text style={styles.saveBtnText}>{isSavingEmailConfig ? "..." : t("admin.saveBtn")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="options" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Parametri</Text>
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Caricamento...</Text>
      ) : (
        <>
          <View style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingLabel}>Messaggio Splash</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.modeBtn, splashMode === "single" && styles.modeBtnActive]}
                onPress={() => handleSaveSplashMode("single")}
              >
                <Text style={[styles.modeBtnText, splashMode === "single" && styles.modeBtnTextActive]}>Singolo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, splashMode === "cycle" && styles.modeBtnActive]}
                onPress={() => handleSaveSplashMode("cycle")}
              >
                <Text style={[styles.modeBtnText, splashMode === "cycle" && styles.modeBtnTextActive]}>Cicla</Text>
              </TouchableOpacity>
            </View>
            {splashMode === "single" ? (
              editingKey === "splash_message" ? (
                <View>
                  <TextInput
                    style={styles.input}
                    placeholder="Messaggio da mostrare nello splash..."
                    placeholderTextColor={Colors.textSecondary}
                    value={editValue}
                    onChangeText={setEditValue}
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingKey(null)}>
                      <Text style={styles.cancelBtnText}>Annulla</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={handleSave}
                      disabled={updateMutation.isPending}
                    >
                      <Text style={styles.saveBtnText}>{updateMutation.isPending ? "..." : t("admin.saveBtn")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={[styles.settingValue, { flex: 1 }]}>
                    {getSettingValue("splash_message") || "Messaggio da mostrare nello splash..."}
                  </Text>
                  <TouchableOpacity onPress={() => startEditing("splash_message")}>
                    <Ionicons name="create" size={20} color={Colors.accent} />
                  </TouchableOpacity>
                </View>
              )
            ) : (
              <View>
                {splashMessagesList.map((msg, idx) => (
                  <View key={idx} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={msg}
                      onChangeText={(text) => {
                        const updated = [...splashMessagesList];
                        updated[idx] = text;
                        setSplashMessagesList(updated);
                        splashMessagesListRef.current = updated;
                      }}
                      onBlur={() => persistSplashList(splashMessagesListRef.current)}
                      placeholder={`Messaggio ${idx + 1}`}
                      placeholderTextColor={Colors.textSecondary}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        const updated = splashMessagesList.filter((_, i) => i !== idx);
                        handleSaveSplashList(updated);
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.error || "#e74c3c"} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.saveBtn, { alignSelf: "flex-start" as const, flexDirection: "row" as const, alignItems: "center" as const, gap: 6 }]}
                  onPress={() => handleSaveSplashList([...splashMessagesList, ""])}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Aggiungi messaggio</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {renderSettingCard(maxPhotosSetting)}
          {renderSettingCard(maxVotesSetting)}
        </>
      )}

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="server-outline" size={20} color={Colors.accent} />
        <Text style={styles.sectionTitle}>Sistema</Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="timer-outline" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Uptime Counters</Text>
          </View>
          <Switch
            value={uptimeWidgetEnabled}
            onValueChange={handleUptimeToggle}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={uptimeWidgetEnabled ? Colors.text : Colors.textSecondary}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {uptimeWidgetEnabled
            ? "Pannello fluttuante uptime attivo — visibile solo agli admin"
            : "Pannello fluttuante uptime nascosto"}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="cloud-download-outline" size={20} color="#ff6b35" />
            <Text style={styles.synecoLabel}>OTA Recovery Gate</Text>
          </View>
          <Switch
            value={otaGateEnabled}
            onValueChange={(val) => otaGateMutation.mutate(val)}
            trackColor={{ false: Colors.border, true: "#ff6b35" }}
            thumbColor={otaGateEnabled ? Colors.text : Colors.textSecondary}
            disabled={otaGateMutation.isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {otaGateEnabled
            ? "Schermata attesa OTA attiva — nuovi login vedranno la gate screen"
            : "Gate OTA disattivata — login normale per tutti gli utenti"}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8, opacity: otaGateEnabled ? 1 : 0.4 }}>
          <Text style={[styles.synecoDesc, { flex: 1 }]}>Secondi attesa:</Text>
          <TextInput
            style={[styles.synecoDesc, { borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, color: Colors.text, minWidth: 60, textAlign: "center" }]}
            value={otaWaitInput}
            onChangeText={setOtaWaitInput}
            keyboardType="numeric"
            maxLength={4}
            editable={otaGateEnabled}
          />
          <TouchableOpacity
            style={[styles.saveBtn, { paddingHorizontal: 12, paddingVertical: 6 }]}
            onPress={() => otaWaitMutation.mutate(otaWaitInput)}
            disabled={otaWaitMutation.isPending || !otaGateEnabled}
          >
            <Text style={styles.saveBtnText}>Salva</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="sync-outline" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Sync Produzione → Sviluppo</Text>
          </View>
        </View>
        {!syncStatus?.available ? (
          <Text style={styles.synecoDesc}>
            Non disponibile — impostare PROD_DATABASE_URL (diverso da DATABASE_URL) nell'ambiente di sviluppo.
          </Text>
        ) : (
          <>
            {syncStatus.lastSync ? (
              <View style={{ marginBottom: 6 }}>
                <Text style={styles.synecoDesc}>
                  Ultimo sync: {new Date(syncStatus.lastSync.startedAt).toLocaleString("it-IT")}{" "}
                  {syncStatus.lastSync.ok
                    ? <Text style={{ color: Colors.accent }}>✓ OK</Text>
                    : <Text style={{ color: Colors.error ?? "#e74c3c" }}>✗ Errore</Text>}
                </Text>
                {!syncStatus.lastSync.ok && syncStatus.lastSync.error && (
                  <Text style={[styles.synecoDesc, { color: Colors.error ?? "#e74c3c", marginTop: 2 }]} numberOfLines={2}>
                    {syncStatus.lastSync.error}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.synecoDesc}>Nessun sync eseguito finora.</Text>
            )}
            {syncStatus.nextScheduledAt && (
              <Text style={styles.synecoDesc}>
                Prossimo sync automatico: {new Date(syncStatus.nextScheduledAt).toLocaleString("it-IT")}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.saveBtn, { marginTop: 10, alignSelf: "flex-start" as const, flexDirection: "row" as const, alignItems: "center" as const, gap: 6, opacity: (syncStatus.inProgress || syncMutation.isPending) ? 0.5 : 1 }]}
              onPress={() => {
                Alert.alert(
                  "Sync produzione → sviluppo",
                  t("admin.devDbOverwriteConfirm"),
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    { text: "Sincronizza", style: "destructive", onPress: () => syncMutation.mutate() },
                  ]
                );
              }}
              disabled={syncStatus.inProgress || syncMutation.isPending}
            >
              {(syncStatus.inProgress || syncMutation.isPending) ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="sync" size={16} color="#fff" />
              )}
              <Text style={styles.saveBtnText}>
                {(syncStatus.inProgress || syncMutation.isPending) ? "Sync in corso..." : "Sincronizza ora"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.sectionHeaderRow}>
        <Ionicons name="terminal" size={20} color="#00cc66" />
        <Text style={[styles.sectionTitle, { color: "#00cc66" }]}>Sviluppo</Text>
      </View>

    </KeyboardAwareScrollViewCompat>

      <Modal
        visible={!!protectedToggle}
        transparent
        animationType="fade"
        onRequestClose={() => { setProtectedToggle(null); setProtectedPassword(""); }}
      >
        <View style={styles.protectedOverlay}>
          <View style={styles.protectedModal}>
            <Text style={styles.protectedTitle}>Conferma Modifica</Text>
            <Text style={styles.protectedSubtitle}>
              {protectedToggle ? `${protectedToggle.value ? "Attivare" : "Disattivare"} "${protectedToggle.label}"` : ""}
            </Text>
            <Text style={styles.protectedDesc}>Inserisci la password admin per confermare</Text>
            <TextInput
              style={styles.protectedInput}
              placeholder="Password admin"
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
              value={protectedPassword}
              onChangeText={setProtectedPassword}
              autoFocus
            />
            <View style={styles.protectedButtons}>
              <TouchableOpacity
                style={styles.protectedCancel}
                onPress={() => { setProtectedToggle(null); setProtectedPassword(""); }}
              >
                <Text style={styles.protectedCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.protectedConfirm, !protectedPassword && { opacity: 0.5 }]}
                disabled={!protectedPassword || protectedToggleMutation.isPending}
                onPress={() => {
                  if (!protectedToggle) return;
                  protectedToggleMutation.mutate({
                    key: protectedToggle.key,
                    value: protectedToggle.value ? "true" : "false",
                    adminPassword: protectedPassword,
                  });
                }}
              >
                {protectedToggleMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <Text style={styles.protectedConfirmText}>Conferma</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDonationTextPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowDonationTextPasswordModal(false); setDonationTextPassword(""); }}
      >
        <View style={styles.protectedOverlay}>
          <View style={styles.protectedModal}>
            <Text style={styles.protectedTitle}>Conferma Modifica</Text>
            <Text style={styles.protectedSubtitle}>Salvare il testo donazione</Text>
            <Text style={styles.protectedDesc}>Inserisci la password admin per confermare</Text>
            <TextInput
              style={styles.protectedInput}
              placeholder="Password admin"
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
              value={donationTextPassword}
              onChangeText={setDonationTextPassword}
              autoFocus
            />
            <View style={styles.protectedButtons}>
              <TouchableOpacity
                style={styles.protectedCancel}
                onPress={() => { setShowDonationTextPasswordModal(false); setDonationTextPassword(""); }}
              >
                <Text style={styles.protectedCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.protectedConfirm, !donationTextPassword && { opacity: 0.5 }]}
                disabled={!donationTextPassword || protectedToggleMutation.isPending}
                onPress={() => {
                  protectedToggleMutation.mutate(
                    { key: "donation_text", value: donationText, adminPassword: donationTextPassword },
                    {
                      onSuccess: () => {
                        setShowDonationTextPasswordModal(false);
                        setDonationTextPassword("");
                        queryClient.invalidateQueries({ queryKey: ["/api/settings/donation"] });
                        Alert.alert("Successo", "Testo donazione salvato");
                      },
                    },
                  );
                }}
              >
                {protectedToggleMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <Text style={styles.protectedConfirmText}>Conferma</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  sectionHeaderRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  accordionPanel: {
    backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  accordionPanelHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 14,
  },
  accordionPanelTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text,
  },
  accordionPanelContent: {
    padding: 14, paddingTop: 0, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  synecoCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.syneco,
  },
  synecoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  synecoInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  synecoLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  synecoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  triggerBtn: {
    backgroundColor: Colors.warning, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, minWidth: 90, alignItems: "center",
  },
  triggerBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#000" },
  matchingStatsRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  matchingStatItem: { flex: 1, alignItems: "center" },
  matchingStatValue: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.warning },
  matchingStatLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  matchingStatDivider: { width: 1, height: 36, backgroundColor: Colors.border, marginHorizontal: 8 },
  lastCycleBox: {
    marginTop: 12, padding: 10, borderRadius: 8,
    backgroundColor: Colors.warning + "15", borderWidth: 1, borderColor: Colors.warning + "40",
  },
  lastCycleTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.warning, marginBottom: 4 },
  lastCycleText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  emailVerifCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.accent,
  },
  paidCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.warning,
  },
  settingCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  settingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  settingActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  uploadBtn: { padding: 4 },
  settingLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  settingValue: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, textAlignVertical: "top" as const,
  },
  editActions: { flexDirection: "row", gap: 12, marginTop: 12, justifyContent: "flex-end" },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.surfaceLight },
  cancelBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.accent },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.background },
  modeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" as const,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  modeBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  modeBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
  modeBtnTextActive: { color: Colors.background },
  providerOption: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  providerOptionActive: { borderColor: Colors.accent, backgroundColor: Colors.surfaceLight },
  providerLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.textSecondary },
  dropdownButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  dropdownButtonText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  dropdownOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24,
  },
  dropdownMenu: {
    backgroundColor: Colors.surface, borderRadius: 12, overflow: "hidden",
    width: "100%", maxWidth: 280, borderWidth: 1, borderColor: Colors.border,
  },
  dropdownMenuItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dropdownMenuItemActive: { backgroundColor: Colors.surfaceLight },
  dropdownMenuItemText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  paypalCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: "#003087",
  },
  emailSmtpCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#4285F4",
  },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24, width: "100%", maxWidth: 400,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text, marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 20,
  },
  modalFieldLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 6, marginTop: 12,
  },
  modalInput: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  protectedOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 24,
  },
  protectedModal: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24, width: "100%", maxWidth: 360,
  },
  protectedTitle: {
    fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text, textAlign: "center", marginBottom: 4,
  },
  protectedSubtitle: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.accent, textAlign: "center", marginBottom: 12,
  },
  protectedDesc: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginBottom: 16,
  },
  protectedInput: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 14,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 20,
  },
  protectedButtons: {
    flexDirection: "row", gap: 12,
  },
  protectedCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center",
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  protectedCancelText: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary,
  },
  protectedConfirm: {
    flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center",
    backgroundColor: Colors.accent,
  },
  protectedConfirmText: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.background,
  },
  countryChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
    marginRight: 6,
  },
  countryChipSelected: {
    borderColor: Colors.warning, backgroundColor: Colors.warning + "22",
  },
  countryChipFlag: {
    fontSize: 14,
  },
  countryChipText: {
    fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary,
  },
  countryChipTextSelected: {
    color: Colors.warning, fontFamily: "Inter_600SemiBold",
  },
});

const brandThemeStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  grid: {
    gap: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 12,
  },
  cardSelected: {
    borderColor: Colors.accent,
  },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "flex-end" as const,
    padding: 5,
    gap: 3,
  },
  swatchAccent: {
    height: 7,
    borderRadius: 3,
  },
  swatchSurface: {
    height: 7,
    borderRadius: 3,
  },
  swatchText: {
    height: 7,
    borderRadius: 3,
  },
  cardBody: {
    flex: 1,
  },
  cardLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
});

const themeStyles = StyleSheet.create({
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  switchLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 2,
  },
  switchDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  defaultLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 10,
    marginLeft: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  card: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  cardActive: {
    borderColor: Colors.accent,
  },
  checkmark: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  swatches: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardLabel: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginBottom: 3,
  },
  cardDesc: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
  },
});

const bgLocationStyles = StyleSheet.create({
  triggerOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    marginTop: 8,
    gap: 10,
  },
  triggerOptionActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  triggerLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  triggerLabelActive: {
    color: Colors.accent,
  },
});

