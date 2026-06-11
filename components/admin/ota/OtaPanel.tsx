// LARGE-FILE-LOCKED — limite: 816 righe (attuali: ~816)
// Aggiungi nuove funzionalità in: components/admin/ota/OtaPanelExtra.tsx
// Motivo: file delicato di dimensione media. Splittare ora introduce rischio.
//         Vedi Task #2584 (regola 600 righe) e Task "Lock dimensione file priorità media".

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Updates from "expo-updates";
import { useTheme } from "@/lib/theme-context";
import { apiRequest } from "@/lib/query-client";
import OtaAssistantChat from "./OtaAssistantChat";
import OtaFailureDevices from "./OtaFailureDevices";

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
  bootSuccessCount: number;
  bootFailureCount: number;
  downloadCount: number;
  autoRollbackEnabled: boolean;
  autoRollbackThreshold: number;
  autoRollbackMinDownloads: number;
  autoRollbackWindowMinutes: number;
  autoRolledBackAt: string | null;
}

function extractOtaNumber(release: OtaRelease, fallbackIndex: number): string {
  if (release.otaVersion) {
    const triplet = release.otaVersion.match(/^\d+\.\d+\.(\d+)$/);
    if (triplet) return triplet[1];
    const legacy = release.otaVersion.match(/OTA-?(\d+)/i);
    if (legacy) return legacy[1];
  }
  return String(fallbackIndex);
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

function bootSuccessRate(r: OtaRelease): number | null {
  if (r.downloadCount <= 0) return null;
  return Math.round((r.bootSuccessCount / r.downloadCount) * 100);
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
  const [expandedAutoId, setExpandedAutoId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const historyInitialized = useRef(false);

  const { data: releases, isLoading, refetch, isFetching } = useQuery<OtaRelease[]>({
    queryKey: ["/api/admin/ota/releases"],
  });

  useEffect(() => {
    if (historyInitialized.current || !releases?.length) return;
    historyInitialized.current = true;
    const first = releases
      .filter((r) => r.status !== "pending" && !(r.status === "rejected" && r.rejectedBy === null))
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
    if (first) setExpandedHistoryId(first.id);
  }, [releases]);

  const handleSync = useCallback(async () => {
    Alert.alert(
      "☁ Sync con server Expo (EAS)",
      "Questa operazione contatta i server Expo per recuperare le nuove release OTA pubblicate. Potrebbe richiedere qualche secondo.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Sincronizza",
          onPress: async () => {
            setSyncing(true);
            try {
              await apiRequest("POST", "/api/admin/ota/sync");
              await qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
            } catch (err: unknown) {
              Alert.alert("Errore sync", err instanceof Error ? err.message : "Impossibile sincronizzare con EAS");
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  }, [qc]);

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
      Alert.alert("Rollback eseguito", "La release è stata ri-pubblicata su EAS production. Gli utenti la riceveranno al prossimo cold start.");
    },
    onError: (err: Error) => {
      setRollingBackId(null);
      Alert.alert("Errore rollback", err.message || "Impossibile eseguire il rollback");
    },
  });

  const autoRollbackMutation = useMutation({
    mutationFn: (params: { id: string; patch: Record<string, unknown> }) =>
      apiRequest("POST", `/api/admin/ota/${params.id}/auto-rollback`, params.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message || "Impossibile aggiornare config auto-rollback");
    },
  });

  const setVersionMutation = useMutation({
    mutationFn: ({ id, otaVersion }: { id: string; otaVersion: string }) =>
      apiRequest("PATCH", `/api/admin/ota/${id}/ota-version`, { otaVersion }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] }); },
    onError: (err: Error) => { Alert.alert("Errore versione", err.message || "Impossibile impostare versione"); },
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
      "L'OTA verrà archiviata e non distribuita a nessun utente (nemmeno admin).",
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
      "Rollback su EAS production",
      `Ri-pubblicare il bundle di questa release su production?\n\nVersione: ${release.otaVersion ?? release.easUpdateId.slice(0, 8)}\nMessaggio: ${release.message ?? "—"}\n\nViene chiamato 'eas update --republish' sul server: gli utenti riceveranno questo bundle al prossimo cold start.`,
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

  const handleSetVersion = useCallback((release: OtaRelease) => {
    Alert.prompt(
      "Imposta numero OTA",
      `Formato: MAJOR.MINOR.N (es: 54.10.27)\nGruppo: ${(release.easGroupId ?? "—").slice(0, 8)}…\n(aggiorna tutti i record del gruppo)`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Salva",
          onPress: (v?: string) => {
            if (v?.trim()) setVersionMutation.mutate({ id: release.id, otaVersion: v.trim() });
          },
        },
      ],
      "plain-text",
      release.otaVersion ?? ""
    );
  }, [setVersionMutation]);

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
        Alert.alert("Nessun aggiornamento", "Bundle già presente o gating server non autorizza il download.");
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

  const allReleases = (releases ?? []).slice().sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const otaNumberMap = new Map<string, string>();
  allReleases.forEach((r, idx) => {
    otaNumberMap.set(r.id, extractOtaNumber(r, idx + 1));
  });

  const pending = (releases ?? []).filter((r) => r.status === "pending");
  const history = (releases ?? [])
    .filter((r) => r.status !== "pending")
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const renderCounters = (release: OtaRelease) => {
    const rate = bootSuccessRate(release);
    return (
      <View style={styles.countersRow}>
        <View style={[styles.counterChip, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
          <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Download</Text>
          <Text style={[styles.counterValue, { color: colors.text }]}>{release.downloadCount}</Text>
        </View>
        <View style={[styles.counterChip, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
          <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Boot OK</Text>
          <Text style={[styles.counterValue, { color: colors.success }]}>{release.bootSuccessCount}</Text>
        </View>
        <View style={[styles.counterChip, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
          <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Boot FAIL</Text>
          <Text style={[styles.counterValue, { color: release.bootFailureCount > 0 ? colors.error : colors.text }]}>{release.bootFailureCount}</Text>
        </View>
        <View style={[styles.counterChip, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
          <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Success rate</Text>
          <Text style={[styles.counterValue, { color: rate == null ? colors.textSecondary : rate >= 70 ? colors.success : colors.error }]}>
            {rate == null ? "—" : `${rate}%`}
          </Text>
        </View>
      </View>
    );
  };

  const renderAutoRollback = (release: OtaRelease) => {
    const expanded = expandedAutoId === release.id;
    return (
      <View style={[styles.autoRollbackBox, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
        <View style={styles.autoRollbackHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.autoRollbackTitle, { color: colors.text }]}>Auto-rollback</Text>
            <Text style={[styles.autoRollbackHint, { color: colors.textSecondary }]}>
              {release.autoRollbackEnabled
                ? `ATTIVO — se boot success <${release.autoRollbackThreshold}% con ≥${release.autoRollbackMinDownloads} download dopo ${release.autoRollbackWindowMinutes}min → auto-reject`
                : "OFF — rollback solo manuale da questo pannello"}
            </Text>
            {release.autoRolledBackAt && (
              <Text style={[styles.autoRollbackHint, { color: colors.error }]}>
                ⚠ Auto-rollback eseguito il {formatDate(release.autoRolledBackAt)}
              </Text>
            )}
          </View>
          <Switch
            value={release.autoRollbackEnabled}
            onValueChange={(val) => autoRollbackMutation.mutate({ id: release.id, patch: { enabled: val } })}
            disabled={autoRollbackMutation.isPending}
            trackColor={{ false: colors.border, true: colors.success }}
            thumbColor={release.autoRollbackEnabled ? "#fff" : colors.textSecondary}
          />
        </View>
        {release.autoRollbackEnabled && (
          <>
            <TouchableOpacity onPress={() => setExpandedAutoId(expanded ? null : release.id)} style={styles.expandToggle}>
              <Text style={[styles.expandToggleText, { color: colors.accent }]}>{expanded ? "▲ Nascondi parametri" : "▼ Modifica parametri"}</Text>
            </TouchableOpacity>
            {expanded && (
              <View style={styles.autoRollbackFields}>
                <AutoRollbackField
                  label="Soglia % boot success"
                  value={release.autoRollbackThreshold}
                  onCommit={(n) => autoRollbackMutation.mutate({ id: release.id, patch: { threshold: n } })}
                  min={1}
                  max={100}
                  suffix="%"
                  colors={colors}
                />
                <AutoRollbackField
                  label="Min downloads"
                  value={release.autoRollbackMinDownloads}
                  onCommit={(n) => autoRollbackMutation.mutate({ id: release.id, patch: { minDownloads: n } })}
                  min={1}
                  max={1000}
                  colors={colors}
                />
                <AutoRollbackField
                  label="Finestra (min)"
                  value={release.autoRollbackWindowMinutes}
                  onCommit={(n) => autoRollbackMutation.mutate({ id: release.id, patch: { windowMinutes: n } })}
                  min={1}
                  max={1440}
                  colors={colors}
                />
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <View>
      <OtaAssistantChat />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>OTA Releases</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleSync}
            disabled={syncing || isFetching}
            style={[styles.syncBtn, { backgroundColor: colors.accent + "18", borderColor: colors.accent }]}
          >
            {syncing
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={[styles.syncBtnText, { color: colors.accent }]}>☁ Sync EAS</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => refetch()}
            disabled={isFetching}
            style={[styles.listBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            {isFetching
              ? <ActivityIndicator size="small" color={colors.textSecondary} />
              : <Text style={[styles.listBtnText, { color: colors.textSecondary }]}>↻ Lista</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.infoBanner, { backgroundColor: colors.accent + "11", borderColor: colors.accent + "55" }]}>
        <Text style={[styles.infoBannerText, { color: colors.text }]}>
          <Text style={{ fontWeight: "700" }}>Flusso OTA</Text> — Quando pubblichi una OTA è{" "}
          <Text style={{ fontWeight: "700" }}>pending</Text>: solo gli account admin la ricevono al cold start per testarla.
          Dopo aver verificato che funziona, click <Text style={{ fontWeight: "700" }}>Approva</Text> e la OTA viene distribuita a tutti gli utenti al loro prossimo cold start.
          Se rilevi un problema, click <Text style={{ fontWeight: "700" }}>Rifiuta</Text>. Il flusso è fisso: non esiste un toggle per saltare la fase di test.
        </Text>
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

      {pending.length === 0 && (
        <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nessuna OTA in attesa</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Pubblica con: ./scripts/publish-ota-full.sh
          </Text>
        </View>
      )}

      {pending.map((release) => {
        const hasGroupId = !!release.easGroupId;
        const otaNum = otaNumberMap.get(release.id) ?? "?";
        return (
          <View key={release.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: hasGroupId ? colors.accent + "44" : colors.error + "55" }]}>
            <View style={styles.cardHeader}>
              <View style={styles.badgeRow}>
                <View style={[styles.numBadge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.numBadgeText}>OTA {otaNum}</Text>
                </View>
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

            {release.otaVersion
              ? <Text style={[styles.versionText, { color: colors.text }]}>{release.otaVersion}</Text>
              : (
                <TouchableOpacity onPress={() => handleSetVersion(release)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.versionText, { color: colors.textSecondary, fontStyle: "italic" }]}>— versione non impostata</Text>
                  <Text style={[styles.badgeText, { color: colors.accent }]}>Imposta ›</Text>
                </TouchableOpacity>
              )}

            {release.message
              ? <Text style={[styles.messageText, { color: colors.text }]}>{release.message}</Text>
              : <Text style={[styles.messageText, { color: colors.textSecondary, fontStyle: "italic" }]}>Nessun messaggio</Text>}

            <Text selectable style={[styles.metaText, { color: colors.textSecondary }]}>
              ID: {release.easUpdateId}
            </Text>
            {release.runtimeVersion && (
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>Runtime: {release.runtimeVersion}</Text>
            )}

            {renderCounters(release)}
            {release.bootFailureCount > 0 && <OtaFailureDevices releaseId={release.id} />}
            {renderAutoRollback(release)}

            {!hasGroupId && (
              <View style={[styles.warningBox, { backgroundColor: colors.error + "11", borderColor: colors.error + "44" }]}>
                <Text style={[styles.warningText, { color: colors.error }]}>
                  Questa release non ha un GroupID EAS valido. Premi "☁ Sync EAS" in alto per risincronizzare, poi riprova ad approvare.
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
            const isObsolete = release.status === "rejected" && release.rejectedBy === null;
            const sc = getStatusColor(release.status, colors);
            const otaNum = otaNumberMap.get(release.id) ?? "?";

            if (isObsolete) {
              return (
                <View key={release.id} style={[styles.obsoleteRow, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
                  <View style={[styles.numBadge, { backgroundColor: colors.textSecondary + "99" }]}>
                    <Text style={styles.numBadgeText}>OTA {otaNum}</Text>
                  </View>
                  <Text style={[styles.dateText, { color: colors.textSecondary, flex: 1 }]}>{formatDate(release.publishedAt)}</Text>
                  <Text style={[styles.badgeText, { color: colors.textSecondary }]}>OBSOLETA</Text>
                </View>
              );
            }

            const isExpanded = expandedHistoryId === release.id;
            return (
              <View key={release.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() => setExpandedHistoryId(isExpanded ? null : release.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.badgeRow}>
                    <View style={[styles.numBadge, { backgroundColor: colors.accent }]}>
                      <Text style={styles.numBadgeText}>OTA {otaNum}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: sc + "22" }]}>
                      <Text style={[styles.badgeText, { color: sc }]}>
                        {getStatusLabel(release.status).toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate(release.publishedAt)}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{isExpanded ? "▲" : "▼"}</Text>
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <>
                    <Text style={[styles.versionText, { color: colors.text }]}>{release.otaVersion ?? "—"}</Text>
                    {release.message && (
                      <Text style={[styles.messageText, { color: colors.text }]}>{release.message}</Text>
                    )}
                    {release.approvedAt && <Text style={[styles.metaText, { color: colors.textSecondary }]}>Approvata: {formatDate(release.approvedAt)}</Text>}
                    {release.rejectedAt && <Text style={[styles.metaText, { color: colors.textSecondary }]}>Rifiutata: {formatDate(release.rejectedAt)}</Text>}
                    {renderCounters(release)}
                    {release.bootFailureCount > 0 && <OtaFailureDevices releaseId={release.id} />}
                    {release.status === "approved" && renderAutoRollback(release)}
                    {release.status === "approved" && (
                      <TouchableOpacity
                        style={[styles.rollbackBtn, { borderColor: colors.accent }]}
                        onPress={() => handleRollback(release)}
                        disabled={rollingBackId === release.id}
                      >
                        {rollingBackId === release.id
                          ? <ActivityIndicator size="small" color={colors.accent} />
                          : <Text style={[styles.rollbackBtnText, { color: colors.accent }]}>↩ Rollback (eas update --republish)</Text>}
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

interface AutoRollbackFieldProps {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  min: number;
  max: number;
  suffix?: string;
  colors: { text: string; textSecondary: string; surface: string; border: string };
}

function AutoRollbackField({ label, value, onCommit, min, max, suffix, colors }: AutoRollbackFieldProps) {
  const [draft, setDraft] = useState(String(value));
  return (
    <View style={styles.autoFieldRow}>
      <Text style={[styles.autoFieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.autoFieldInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          style={[styles.autoFieldInput, { color: colors.text }]}
          value={draft}
          onChangeText={setDraft}
          onBlur={() => {
            const n = parseInt(draft, 10);
            if (Number.isFinite(n) && n >= min && n <= max && n !== value) {
              onCommit(n);
            } else {
              setDraft(String(value));
            }
          }}
          keyboardType="number-pad"
          returnKeyType="done"
        />
        {suffix ? <Text style={[styles.autoFieldSuffix, { color: colors.textSecondary }]}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontSize: 17, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  syncBtn: { borderRadius: 6, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 6 },
  syncBtnText: { fontSize: 12, fontWeight: "700" as const },
  listBtn: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  listBtnText: { fontSize: 12, fontWeight: "600" as const },
  numBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, marginRight: 4 },
  numBadgeText: { fontSize: 11, fontWeight: "800" as const, color: "#fff", letterSpacing: 0.3 },
  badgeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", flex: 1, gap: 4 },
  warningBox: { borderRadius: 6, borderWidth: 1, padding: 10, marginTop: 8, marginBottom: 4 },
  warningText: { fontSize: 12, lineHeight: 17 },
  emptyBox: { borderRadius: 8, padding: 20, alignItems: "center", borderWidth: 1, marginBottom: 12 },
  emptyText: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  emptySubtext: { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", textAlign: "center" },
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
  forceUpdateText: { color: "#fff", fontSize: 14, fontWeight: "700" as const },
  infoBanner: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  infoBannerText: { fontSize: 12, lineHeight: 17 },
  countersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
  },
  counterChip: {
    flexGrow: 1,
    minWidth: 70,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  counterLabel: { fontSize: 10, fontWeight: "600" as const, letterSpacing: 0.3, textTransform: "uppercase" },
  counterValue: { fontSize: 16, fontWeight: "700" as const, marginTop: 2 },
  autoRollbackBox: {
    borderRadius: 6,
    borderWidth: 1,
    padding: 10,
    marginTop: 10,
  },
  autoRollbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  autoRollbackTitle: { fontSize: 13, fontWeight: "700" as const },
  autoRollbackHint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  expandToggle: { marginTop: 8 },
  expandToggleText: { fontSize: 12, fontWeight: "600" as const },
  autoRollbackFields: { marginTop: 8, gap: 6 },
  autoFieldRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  autoFieldLabel: { fontSize: 12, flex: 1 },
  autoFieldInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 80,
  },
  autoFieldInput: { fontSize: 13, padding: 0, minWidth: 40, textAlign: "right" },
  autoFieldSuffix: { fontSize: 11, marginLeft: 4 },
  obsoleteRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, borderWidth: 1, marginBottom: 4 },
} as const);
