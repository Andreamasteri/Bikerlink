/**
 * Task #91 — Pannello admin per le due scansioni complete on-demand di Horus.
 * Task #614 — "Genera Manuale" pipeline completa: avanzamento live + ETA +
 *             push a Bowie/Horus + errori Ollama/ai-hub inline.
 *
 * Sub-componenti, helper e stili in components/admin/HorusScanCards.tsx
 * (split per ratchet 650 righe).
 */
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import {
  type ScanMode,
  type ScanState,
  ScanCard,
  ProposalsBlock,
  Row,
  fmtDate,
  horusScanStyles as styles,
} from "@/components/admin/HorusScanCards";

type PushTarget = "bowie" | "horus";

interface HorusScanStatusResponse {
  scans: Record<ScanMode, ScanState>;
  lastAnalysis: {
    id: string;
    createdAt: string;
    status: string;
    summary: string | null;
    modelId: string | null;
    proposals: string | null;
  } | null;
  manual: {
    length: number;
    hasPrevious: boolean;
    previousSavedAt: string | null;
  };
}

interface StartResponse {
  started: boolean;
  reason: string | null;
  status: ScanState;
}

interface PushResponse {
  target: PushTarget;
  output: string;
}

export default function HorusScanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const statusQuery = useQuery<HorusScanStatusResponse>({
    queryKey: ["/api/admin/horus-scan/status"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/horus-scan/status")).json(),
    staleTime: 3_000,
    refetchInterval: 5_000,
  });

  const startMutation = useMutation<StartResponse, Error, ScanMode>({
    mutationFn: async (mode: ScanMode) =>
      (await apiRequest("POST", "/api/admin/horus-scan/start", { mode })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/horus-scan/status"] });
    },
  });

  const pushMutation = useMutation<PushResponse, Error, PushTarget>({
    mutationFn: async (target: PushTarget) =>
      (await apiRequest("POST", "/api/admin/horus-scan/push", { target })).json(),
  });

  const [pendingMode, setPendingMode] = useState<ScanMode | null>(null);
  const [lastNotStarted, setLastNotStarted] = useState<{ mode: ScanMode; reason: string } | null>(
    null,
  );
  const [pushResult, setPushResult] = useState<{
    target: PushTarget;
    ok: boolean;
    message: string;
  } | null>(null);
  const pushingTarget = useRef<PushTarget | null>(null);

  const start = (mode: ScanMode) => {
    setPendingMode(mode);
    setLastNotStarted(null);
    startMutation.mutate(mode, {
      onSuccess: (res) => {
        if (!res.started) {
          setLastNotStarted({ mode, reason: res.reason ?? "non avviata" });
        }
      },
      onSettled: () => setPendingMode(null),
    });
  };

  const push = (target: PushTarget) => {
    pushingTarget.current = target;
    setPushResult(null);
    pushMutation.mutate(target, {
      onSuccess: () => {
        setPushResult({ target, ok: true, message: "Push completato con successo." });
        pushingTarget.current = null;
      },
      onError: (err) => {
        setPushResult({ target, ok: false, message: err.message });
        pushingTarget.current = null;
      },
      onSettled: () => {
        pushingTarget.current = null;
      },
    });
  };

  const data = statusQuery.data;
  const analysis = data?.scans?.analysis;
  const manual = data?.scans?.manual;
  const lastAnalysis = data?.lastAnalysis ?? null;
  const manualInfo = data?.manual;

  const manualDone = manual?.status === "completed";
  const manualHasContent = (manualInfo?.length ?? 0) > 0;
  const showPushButtons = manualHasContent && manual?.status !== "running";
  const isPushingBowie = pushMutation.isPending && pushingTarget.current === "bowie";
  const isPushingHorus = pushMutation.isPending && pushingTarget.current === "horus";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
    >
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="radar" size={26} color="#0EA5E9" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Horus — Scansioni complete</Text>
          <Text style={styles.subtitle}>
            Scansioni on-demand a lotti dell'intera app (sola lettura). Nessun avvio automatico.
          </Text>
        </View>
      </View>

      {/* ── Analisi codice + DB ── */}
      <ScanCard
        title="Analisi completa codice+DB"
        description="Legge tutto il codice locale + integrità DB e produce proposte azionabili."
        icon="magnify-scan"
        state={analysis}
        starting={pendingMode === "analysis" && startMutation.isPending}
        disabledOther={pendingMode === "manual" && startMutation.isPending}
        notStartedReason={lastNotStarted?.mode === "analysis" ? lastNotStarted.reason : null}
        onStart={() => start("analysis")}
        buttonLabel="Avvia analisi"
        testID="horus-scan-start-analysis"
      />

      {/* Ultime proposte dell'analisi */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ultime proposte analisi</Text>
        {lastAnalysis ? (
          <>
            <Row label="Quando" value={fmtDate(lastAnalysis.createdAt)} />
            <Row label="Stato" value={lastAnalysis.status} />
            <Row label="Modello" value={lastAnalysis.modelId ?? "—"} mono />
            {lastAnalysis.summary ? (
              <Text style={styles.body}>{lastAnalysis.summary}</Text>
            ) : null}
            {lastAnalysis.proposals ? (
              <ProposalsBlock proposals={lastAnalysis.proposals} />
            ) : (
              <Text style={styles.hint}>Nessuna proposta salvata per l'ultima analisi.</Text>
            )}
          </>
        ) : (
          <Text style={styles.hint}>Nessuna analisi ancora eseguita.</Text>
        )}
      </View>

      {/* ── Manuale ── */}
      <ScanCard
        title="Genera manuale"
        description="Descrive per-file cosa fa e a quale area contribuisce, salvato nello storage di Nadir."
        icon="book-open-variant"
        state={manual}
        starting={pendingMode === "manual" && startMutation.isPending}
        disabledOther={pendingMode === "analysis" && startMutation.isPending}
        notStartedReason={lastNotStarted?.mode === "manual" ? lastNotStarted.reason : null}
        onStart={() => start("manual")}
        buttonLabel="Genera manuale"
        testID="horus-scan-start-manual"
      />

      {/* ── Manuale generato + Push ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Manuale generato</Text>
        <Row label="Lunghezza testo" value={`${manualInfo?.length ?? 0} caratteri`} />
        <Row label="Versione precedente" value={manualInfo?.hasPrevious ? "presente" : "—"} />
        {manualInfo?.previousSavedAt ? (
          <Row label="Precedente salvato" value={fmtDate(manualInfo.previousSavedAt)} />
        ) : null}

        {manualDone && manual?.resultSummary ? (
          <View style={styles.resultBox}>
            <MaterialCommunityIcons name="check-circle" size={16} color={Colors.success} />
            <Text style={[styles.hint, { color: Colors.success, flex: 1, marginBottom: 0 }]}>
              {manual.resultSummary}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, { marginTop: 12 }]}
          onPress={() => router.push("/admin/nadir" as Href)}
          testID="horus-scan-open-manual"
        >
          <MaterialCommunityIcons name="open-in-new" size={18} color={Colors.primary} />
          <Text style={[styles.btnText, { color: Colors.primary }]}>Apri manuale (Nadir)</Text>
        </TouchableOpacity>

        {showPushButtons ? (
          <>
            <View style={styles.pushDivider}>
              <Text style={styles.pushDividerLabel}>Inietta manuale nei modelli TC</Text>
            </View>
            <Text style={styles.pushHint}>
              Aggiorna il system prompt del modello Ollama sul ThinkCentre con il manuale
              generato. Richiede TC online (~60–120 s).
            </Text>
            <View style={styles.pushRow}>
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.btnPush,
                  (isPushingBowie || isPushingHorus) && styles.btnDisabled,
                  { flex: 1 },
                ]}
                onPress={() => push("bowie")}
                disabled={isPushingBowie || isPushingHorus}
                testID="horus-scan-push-bowie"
              >
                {isPushingBowie ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="upload" size={16} color="#fff" />
                    <Text style={styles.btnText}>Push a Bowie</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.btnPushSecondary,
                  (isPushingBowie || isPushingHorus) && styles.btnDisabled,
                  { flex: 1 },
                ]}
                onPress={() => push("horus")}
                disabled={isPushingBowie || isPushingHorus}
                testID="horus-scan-push-horus"
              >
                {isPushingHorus ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="upload" size={16} color={Colors.primary} />
                    <Text style={[styles.btnText, { color: Colors.primary }]}>Push a Horus</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {pushResult ? (
              <View
                style={[
                  styles.pushFeedback,
                  { borderColor: pushResult.ok ? Colors.success : Colors.error },
                ]}
              >
                <MaterialCommunityIcons
                  name={pushResult.ok ? "check-circle" : "alert-circle"}
                  size={16}
                  color={pushResult.ok ? Colors.success : Colors.error}
                />
                <Text
                  style={[
                    styles.hint,
                    { color: pushResult.ok ? Colors.success : Colors.error, flex: 1, marginBottom: 0 },
                  ]}
                >
                  {`[${pushResult.target.toUpperCase()}] ${pushResult.message}`}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      {statusQuery.isError ? (
        <Text style={styles.errText}>Errore lettura stato scansioni.</Text>
      ) : null}
    </ScrollView>
  );
}
