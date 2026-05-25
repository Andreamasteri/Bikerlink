import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Updates from "expo-updates";
import { useTheme } from "@/lib/theme-context";
import { apiRequest } from "@/lib/query-client";

interface OtaRelease {
  id: string;
  easUpdateId: string;
  easGroupId: string | null;
  channel: string;
  runtimeVersion: string | null;
  message: string | null;
  otaVersion: string | null;
  status: "pending" | "approved" | "rejected";
  publishedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
}

function getStatusColor(status: string, colors: { success: string; error: string; accent: string; textSecondary: string }): string {
  if (status === "approved") return colors.success;
  if (status === "rejected") return colors.error;
  return colors.accent;
}

function getStatusLabel(status: string): string {
  if (status === "approved") return "Approvata ✓";
  if (status === "rejected") return "Rifiutata ✗";
  return "In attesa";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return dateStr; }
}

export default function OtaPanel() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [tryingId, setTryingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [forcingUpdate, setForcingUpdate] = useState(false);

  const [syncing, setSyncing] = useState(false);

  const { data: releases, isLoading, refetch, isFetching } = useQuery<OtaRelease[]>({
    queryKey: ["/api/admin/ota/releases"],
  });

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await apiRequest("POST", "/api/admin/ota/sync");
      await qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
    } catch (err: unknown) {
      Alert.alert("Errore sync", err instanceof Error ? err.message : "Impossibile sincronizzare con EAS");
    } finally {
      setSyncing(false);
    }
  }, [qc]);

  const { data: settings, isLoading: settingsLoading } = useQuery<{ directApply: boolean }>({
    queryKey: ["/api/admin/ota/settings"],
  });

  const settingsMutation = useMutation({
    mutationFn: (directApply: boolean) =>
      apiRequest("POST", "/api/admin/ota/settings", { directApply }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ota/settings"] });
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message || "Impossibile salvare le impostazioni");
      qc.invalidateQueries({ queryKey: ["/api/admin/ota/settings"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/ota/${id}/approve`),
    onSuccess: () => {
      setApprovingId(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
    },
    onError: (err: Error) => {
      setApprovingId(null);
      Alert.alert("Errore", err.message || "Impossibile approvare");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/ota/${id}/reject`),
    onSuccess: () => {
      setRejectingId(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
    },
    onError: (err: Error) => {
      setRejectingId(null);
      Alert.alert("Errore", err.message || "Impossibile rifiutare");
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/ota/${id}/rollback`),
    onSuccess: () => {
      setRollingBackId(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
    },
    onError: (err: Error) => {
      setRollingBackId(null);
      Alert.alert("Errore rollback", err.message || "Impossibile eseguire il rollback");
    },
  });

  const handleApprove = useCallback((release: OtaRelease) => {
    Alert.alert(
      "Approva e Distribuisci",
      `Promuovere questa OTA su production?\n\nVersione: ${release.otaVersion ?? release.easUpdateId.slice(0, 8)}\nMessaggio: ${release.message ?? "—"}`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Approva e Distribuisci",
          onPress: () => {
            setApprovingId(release.id);
            approveMutation.mutate(release.id);
          },
        },
      ]
    );
  }, [approveMutation]);

  const handleReject = useCallback((release: OtaRelease) => {
    Alert.alert(
      "Rifiuta OTA",
      "L'OTA verrà archiviata e non distribuita.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Rifiuta",
          style: "destructive",
          onPress: () => {
            setRejectingId(release.id);
            rejectMutation.mutate(release.id);
          },
        },
      ]
    );
  }, [rejectMutation]);

  const handleRollback = useCallback((release: OtaRelease) => {
    Alert.alert(
      "Rollback OTA",
      `Ri-promuovere questa release su production?\n\nVersione: ${release.otaVersion ?? release.easUpdateId.slice(0, 8)}\nMessaggio: ${release.message ?? "—"}\n\nGli utenti riceveranno questa versione precedente.`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Esegui Rollback",
          style: "destructive",
          onPress: () => {
            setRollingBackId(release.id);
            rollbackMutation.mutate(release.id);
          },
        },
      ]
    );
  }, [rollbackMutation]);

  const handleForceUpdate = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Non disponibile", "Il force update funziona solo su dispositivo Android/iOS.");
      return;
    }
    setForcingUpdate(true);
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        Alert.alert("Nessun aggiornamento", "Sei già all'ultima versione disponibile sul canale production.");
        return;
      }
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew) {
        Alert.alert(
          "Aggiornamento pronto",
          "Bundle scaricato. L'app si riavvierà ora per applicarlo.",
          [{ text: "Riavvia ora", onPress: () => Updates.reloadAsync() }]
        );
      } else {
        Alert.alert("Bundle già presente", "Il bundle era già aggiornato. Riavvio per applicarlo.", [
          { text: "Riavvia", onPress: () => Updates.reloadAsync() },
          { text: "Annulla", style: "cancel" },
        ]);
      }
    } catch (err: unknown) {
      Alert.alert("Errore force update", err instanceof Error ? err.message : "Impossibile scaricare l'aggiornamento");
    } finally {
      setForcingUpdate(false);
    }
  }, []);

  const handleTryOta = useCallback(async (release: OtaRelease) => {
    if (Platform.OS === "web") {
      Alert.alert("Prova OTA", `Su web non è applicabile direttamente.\nUpdate ID: ${release.easUpdateId}`);
      return;
    }
    setTryingId(release.id);
    try {
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew) {
        Alert.alert(
          "OTA scaricata",
          "Aggiornamento pronto. Riavvio app.",
          [{ text: "Riavvia", onPress: () => Updates.reloadAsync() }]
        );
      } else {
        Alert.alert("Nessun aggiornamento", "Nessun nuovo update trovato su staging.");
      }
    } catch (err: unknown) {
      Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile scaricare l'OTA");
    } finally {
      setTryingId(null);
    }
  }, []);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const pending = (releases ?? []).filter((r) => r.status === "pending");
  const history = (releases ?? []).filter((r) => r.status !== "pending");

  const directApply = settings?.directApply ?? false;

  return (
    <View>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>OTA Releases</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleSync}
            disabled={syncing || isFetching}
            style={[styles.syncBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            {syncing
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={[styles.syncBtnText, { color: colors.accent }]}>⟳ Sync EAS</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => refetch()} disabled={isFetching} style={styles.refreshBtn}>
            {isFetching
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={[styles.refreshText, { color: colors.accent }]}>↻</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.forceUpdateBtn, { backgroundColor: colors.accent }]}
        onPress={handleForceUpdate}
        disabled={forcingUpdate}
      >
        {forcingUpdate
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.forceUpdateText}>⚡ Forza Aggiornamento OTA su questo dispositivo</Text>}
      </TouchableOpacity>

      <View style={[styles.directApplyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.directApplyLeft}>
          <Text style={[styles.directApplyLabel, { color: colors.text }]}>Applicazione Diretta</Text>
          {settingsLoading
            ? null
            : directApply
              ? <Text style={[styles.directApplyNote, { color: colors.success }]}>
                  Attiva — le nuove OTA vengono promosse in production automaticamente
                </Text>
              : <Text style={[styles.directApplyNote, { color: colors.textSecondary }]}>
                  Disattiva — le OTA richiedono approvazione manuale
                </Text>}
        </View>
        {settingsLoading
          ? <ActivityIndicator size="small" color={colors.accent} />
          : <Switch
              value={directApply}
              onValueChange={(val) => settingsMutation.mutate(val)}
              disabled={settingsMutation.isPending}
              trackColor={{ false: colors.border, true: colors.success }}
              thumbColor={directApply ? "#fff" : colors.textSecondary}
            />}
      </View>

      {pending.length === 0 && (
        <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nessuna OTA in attesa</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Pubblica con: ./scripts/publish-ota.sh --message "..."
          </Text>
        </View>
      )}

      {pending.map((release) => {
        const hasGroupId = !!release.easGroupId;
        return (
          <View key={release.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: hasGroupId ? colors.accent + "44" : colors.error + "55" }]}>
            <View style={styles.cardHeader}>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: colors.accent + "22" }]}>
                  <Text style={[styles.badgeText, { color: colors.accent }]}>IN ATTESA</Text>
                </View>
                {hasGroupId
                  ? (
                    <View style={[styles.badge, { backgroundColor: colors.success + "22", marginLeft: 6 }]}>
                      <Text style={[styles.badgeText, { color: colors.success }]}>● GroupID OK</Text>
                    </View>
                  )
                  : (
                    <View style={[styles.badge, { backgroundColor: colors.error + "22", marginLeft: 6 }]}>
                      <Text style={[styles.badgeText, { color: colors.error }]}>⚠ RISINCRONIZZA</Text>
                    </View>
                  )}
              </View>
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate(release.publishedAt)}</Text>
            </View>

            <Text style={[styles.versionText, { color: colors.text }]}>
              {release.otaVersion ?? release.easUpdateId.slice(0, 16) + "…"}
            </Text>

            {release.message
              ? <Text style={[styles.messageText, { color: colors.text }]}>{release.message}</Text>
              : <Text style={[styles.messageText, { color: colors.textSecondary, fontStyle: "italic" }]}>Nessun messaggio</Text>}

            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              ID: {release.easUpdateId.slice(0, 20)}…
            </Text>
            {release.runtimeVersion && (
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>Runtime: {release.runtimeVersion}</Text>
            )}

            {!hasGroupId && (
              <View style={[styles.warningBox, { backgroundColor: colors.error + "11", borderColor: colors.error + "44" }]}>
                <Text style={[styles.warningText, { color: colors.error }]}>
                  Questa release non ha un GroupID EAS valido. Premi "⟳ Sync EAS" in alto per risincronizzare, poi riprova ad approvare.
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
                onPress={() => handleTryOta(release)}
                disabled={tryingId === release.id}
              >
                {tryingId === release.id
                  ? <ActivityIndicator size="small" color={colors.text} />
                  : <Text style={[styles.actionBtnText, { color: colors.text }]}>🔬 Prova OTA</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, {
                  backgroundColor: hasGroupId ? colors.success : colors.textSecondary + "33",
                  borderColor: hasGroupId ? colors.success : colors.textSecondary + "55",
                  opacity: hasGroupId ? 1 : 0.5,
                }]}
                onPress={() => handleApprove(release)}
                disabled={!hasGroupId || approvingId === release.id}
                accessibilityState={{ disabled: !hasGroupId || approvingId === release.id }}
              >
                {approvingId === release.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[styles.actionBtnText, { color: hasGroupId ? "#fff" : colors.textSecondary }]}>
                      {hasGroupId ? "✓ Approva e Distribuisci" : "✗ Approva (GroupID mancante)"}
                    </Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "transparent", borderColor: colors.error }]}
                onPress={() => handleReject(release)}
                disabled={rejectingId === release.id}
              >
                {rejectingId === release.id
                  ? <ActivityIndicator size="small" color={colors.error} />
                  : <Text style={[styles.actionBtnText, { color: colors.error }]}>✗ Rifiuta</Text>}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {history.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Storico</Text>
          {history.map((release) => {
            const sc = getStatusColor(release.status, colors);
            return (
              <View key={release.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.badge, { backgroundColor: sc + "22" }]}>
                    <Text style={[styles.badgeText, { color: sc }]}>
                      {getStatusLabel(release.status).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate(release.publishedAt)}</Text>
                </View>

                <Text style={[styles.versionText, { color: colors.text }]}>
                  {release.otaVersion ?? release.easUpdateId.slice(0, 16) + "…"}
                </Text>

                {release.message && (
                  <Text style={[styles.messageText, { color: colors.text }]}>{release.message}</Text>
                )}

                {release.approvedAt && (
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    Approvata: {formatDate(release.approvedAt)}
                  </Text>
                )}
                {release.rejectedAt && (
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    Rifiutata: {formatDate(release.rejectedAt)}
                  </Text>
                )}

                {release.status === "approved" && (
                  <TouchableOpacity
                    style={[styles.rollbackBtn, { borderColor: colors.accent }]}
                    onPress={() => handleRollback(release)}
                    disabled={rollingBackId === release.id}
                  >
                    {rollingBackId === release.id
                      ? <ActivityIndicator size="small" color={colors.accent} />
                      : <Text style={[styles.rollbackBtnText, { color: colors.accent }]}>↩ Rollback su Production</Text>}
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontSize: 17, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  syncBtn: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  syncBtnText: { fontSize: 12, fontWeight: "600" as const },
  refreshBtn: { padding: 8 },
  refreshText: { fontSize: 18 },
  badgeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", flex: 1, gap: 4 },
  warningBox: { borderRadius: 6, borderWidth: 1, padding: 10, marginTop: 8, marginBottom: 4 },
  warningText: { fontSize: 12, lineHeight: 17 },
  emptyBox: { borderRadius: 8, padding: 20, alignItems: "center", borderWidth: 1, marginBottom: 12 },
  emptyText: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  emptySubtext: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    textAlign: "center",
  },
  card: { borderRadius: 8, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "800" as const, letterSpacing: 0.5 },
  dateText: { fontSize: 11 },
  versionText: {
    fontSize: 16,
    fontWeight: "700" as const,
    marginBottom: 4,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  messageText: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
  metaText: {
    fontSize: 11,
    marginBottom: 2,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  actions: { flexDirection: "column", gap: 8, marginTop: 12 },
  actionBtn: { borderRadius: 6, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center", borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: "700" as const },
  rollbackBtn: { marginTop: 10, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, alignItems: "center", borderWidth: 1, borderStyle: "dashed" as const },
  rollbackBtnText: { fontSize: 12, fontWeight: "600" as const },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 8,
  },
  forceUpdateBtn: {
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 12,
    minHeight: 46,
  },
  forceUpdateText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700" as const,
  },
  directApplyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  directApplyLeft: {
    flex: 1,
    marginRight: 12,
  },
  directApplyLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    marginBottom: 2,
  },
  directApplyNote: {
    fontSize: 11,
    lineHeight: 15,
  },
} as const);
