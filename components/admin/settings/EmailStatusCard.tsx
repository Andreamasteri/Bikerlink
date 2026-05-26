import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { apiRequest } from "@/lib/query-client";

interface EmailConfig {
  gmailUser: string | null;
  gmailAppPassword: string | null;
  configured: boolean;
}
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

export const emailStatusStyles = StyleSheet.create({
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

const configBadgeStyles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeOk: { backgroundColor: "rgba(34,197,94,0.15)" },
  badgeMissing: { backgroundColor: "rgba(239,68,68,0.15)" },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text, letterSpacing: 0.5 },
});

const smtpStyles = StyleSheet.create({
  expandRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  expandLabel: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.accent },
  form: { paddingTop: 6, gap: 4 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary, marginTop: 8, marginBottom: 4 },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text },
  result: { padding: 10, borderRadius: 8, borderLeftWidth: 3, marginTop: 8 },
  resultText: { fontFamily: "Inter_500Medium", fontSize: 12 },
});

export function EmailStatusCard() {
  const t = useT();
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; messageId?: string; errorCode?: string; error?: string; smtpResponse?: string } | null>(null);

  const [smtpExpanded, setSmtpExpanded] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpAdminPwd, setSmtpAdminPwd] = useState("");
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [smtpSaveResult, setSmtpSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: emailConfig, refetch: refetchEmailConfig } = useQuery<EmailConfig>({
    queryKey: ["/api/admin/settings/email-config"],
    refetchInterval: 30000,
  });
  const { data: diag, refetch: refetchDiag, isLoading: loadingDiag } = useQuery<EmailDiagnostics>({
    queryKey: ["/api/admin/email-status"],
    refetchInterval: 30000,
  });
  const { data: rl, refetch: refetchRL } = useQuery<RateLimitStatus>({
    queryKey: ["/api/admin/email-rate-limit-status"],
    refetchInterval: 30000,
  });

  const handleSaveSmtp = async () => {
    if (!smtpAdminPwd.trim()) {
      Alert.alert("Errore", "Inserisci la password admin per confermare la modifica.");
      return;
    }
    setSavingSmtp(true);
    setSmtpSaveResult(null);
    try {
      await apiRequest("PUT", "/api/admin/settings/email-config", {
        gmailUser: smtpUser.trim() || null,
        gmailAppPassword: smtpPassword.trim() || null,
        adminPassword: smtpAdminPwd.trim(),
      });
      setSmtpSaveResult({ ok: true, message: "Credenziali SMTP salvate correttamente." });
      setSmtpUser("");
      setSmtpPassword("");
      setSmtpAdminPwd("");
      refetchEmailConfig();
      refetchDiag();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Salvataggio fallito";
      setSmtpSaveResult({ ok: false, message: msg });
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/email-test", {});
      const json = await res.json();
      setTestResult(json);
      refetchDiag();
    } catch (e: unknown) {
      setTestResult({ ok: false, error: (e instanceof Error ? e.message : null) || t("admin.networkError") });
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
            } catch (e: unknown) {
              Alert.alert("Errore", (e instanceof Error ? e.message : null) || "Reset fallito");
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
        <View style={[configBadgeStyles.badge, emailConfig?.configured ? configBadgeStyles.badgeOk : configBadgeStyles.badgeMissing]}>
          <Text style={configBadgeStyles.badgeText}>{emailConfig?.configured ? "CONFIGURATO" : "MANCANTI"}</Text>
        </View>
        <TouchableOpacity onPress={() => { refetchEmailConfig(); refetchDiag(); refetchRL(); }} style={emailStatusStyles.iconBtn}>
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
              {emailConfig?.gmailUser ? (
                <Text style={emailStatusStyles.rowValue}>
                  Email: {emailConfig.gmailUser}
                </Text>
              ) : null}
              {emailConfig?.gmailAppPassword ? (
                <Text style={emailStatusStyles.rowValue}>
                  App Password: {emailConfig.gmailAppPassword}
                </Text>
              ) : null}
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

          {/* Configura credenziali SMTP */}
          <TouchableOpacity
            style={smtpStyles.expandRow}
            onPress={() => { setSmtpExpanded((v) => !v); setSmtpSaveResult(null); }}
          >
            <Ionicons name="key" size={15} color={Colors.accent} />
            <Text style={smtpStyles.expandLabel}>Configura credenziali Gmail / SMTP</Text>
            <Ionicons name={smtpExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
          </TouchableOpacity>

          {smtpExpanded && (
            <View style={smtpStyles.form}>
              <Text style={smtpStyles.fieldLabel}>Email Gmail (es. nome@gmail.com)</Text>
              <TextInput
                style={smtpStyles.input}
                placeholder="gmail account"
                placeholderTextColor={Colors.textSecondary}
                value={smtpUser}
                onChangeText={setSmtpUser}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={smtpStyles.fieldLabel}>App Password Gmail (16 caratteri)</Text>
              <TextInput
                style={smtpStyles.input}
                placeholder="xxxx xxxx xxxx xxxx"
                placeholderTextColor={Colors.textSecondary}
                value={smtpPassword}
                onChangeText={setSmtpPassword}
                autoCapitalize="none"
                secureTextEntry
              />
              <Text style={smtpStyles.fieldLabel}>Password admin (conferma identità)</Text>
              <TextInput
                style={smtpStyles.input}
                placeholder="password admin"
                placeholderTextColor={Colors.textSecondary}
                value={smtpAdminPwd}
                onChangeText={setSmtpAdminPwd}
                secureTextEntry
              />
              {smtpSaveResult && (
                <View style={[smtpStyles.result, { borderLeftColor: smtpSaveResult.ok ? "#22c55e" : "#ef4444", backgroundColor: smtpSaveResult.ok ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)" }]}>
                  <Text style={[smtpStyles.resultText, { color: smtpSaveResult.ok ? "#22c55e" : "#ef4444" }]}>{smtpSaveResult.message}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[emailStatusStyles.btn, emailStatusStyles.btnPrimary, { marginTop: 8 }, savingSmtp && { opacity: 0.6 }]}
                onPress={handleSaveSmtp}
                disabled={savingSmtp}
              >
                {savingSmtp ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="save" size={16} color="#fff" />
                    <Text style={emailStatusStyles.btnText}>Salva credenziali</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}
