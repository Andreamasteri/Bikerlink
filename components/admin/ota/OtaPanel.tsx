// LARGE-FILE-LOCKED — limite: 813 righe (baseline)
// Aggiungi nuove funzionalità in: components/admin/ota/OtaPanelExtra.tsx
// Motivo: file delicato di dimensione media. Splittare ora introduce rischio.

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Updates from "expo-updates";
import { useTheme } from "@/lib/theme-context";
import { apiRequest } from "@/lib/query-client";
import { performDirectOtaUpdate } from "@/hooks/useOtaAutoUpdate";
import OtaAssistantChat from "./OtaAssistantChat";
import {
  type OtaRelease,
  extractOtaNumber,
} from "./OtaPanel.helpers";

import { styles } from "./OtaPanel.styles";
import { PendingReleaseCard, HistoryReleaseCard } from "./OtaPanel.part2";

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
              const result = await apiRequest("POST", "/api/admin/ota/sync") as { ok: boolean; inserted: number; backfilled: number; syncedAt: string };
              await qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
              const msg = result.inserted > 0
                ? `${result.inserted} nuova/e release sincronizzata/e da EAS.`
                : "Nessuna nuova release su EAS. Lista aggiornata.";
              Alert.alert("Sync completato", msg);
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
      const result = await performDirectOtaUpdate();
      if (result.isNew) {
        Alert.alert(
          "OTA scaricata",
          "Aggiornamento pronto. Riavvio app.",
          [{ text: "Riavvia", onPress: () => Updates.reloadAsync() }]
        );
      } else {
        Alert.alert(
          "Bundle già scaricato",
          "L'aggiornamento era già stato scaricato in background. Riavvio per applicarlo.",
          [
            { text: "Riavvia ora", onPress: () => Updates.reloadAsync() },
            { text: "Annulla", style: "cancel" },
          ]
        );
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

      {pending.map((release) => (
        <PendingReleaseCard
          key={release.id}
          release={release}
          otaNum={otaNumberMap.get(release.id) ?? "?"}
          colors={colors}
          tryingId={tryingId}
          approvingId={approvingId}
          rejectingId={rejectingId}
          handleTryOta={handleTryOta}
          handleApprove={handleApprove}
          handleReject={handleReject}
          handleSetVersion={handleSetVersion}
          expandedAutoId={expandedAutoId}
          setExpandedAutoId={setExpandedAutoId}
          autoRollbackMutation={autoRollbackMutation}
        />
      ))}

      {history.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Storico</Text>
          {history.map((release) => (
            <HistoryReleaseCard
              key={release.id}
              release={release}
              otaNum={otaNumberMap.get(release.id) ?? "?"}
              colors={colors}
              rollingBackId={rollingBackId}
              handleRollback={handleRollback}
              expandedHistoryId={expandedHistoryId}
              setExpandedHistoryId={setExpandedHistoryId}
              expandedAutoId={expandedAutoId}
              setExpandedAutoId={setExpandedAutoId}
              autoRollbackMutation={autoRollbackMutation}
            />
          ))}
        </>
      )}
    </View>
  );
}


