/**
 * Task #93 — Pannello admin per i due job on-demand di Ares.
 *
 * Card dedicata (finora i job si potevano lanciare solo da chat Bowie, da
 * un'azione admin generica o chiamando gli endpoint a mano). Due sezioni con
 * pulsanti che POSTano su /api/admin/ares/jobs/:mode/start:
 *   • "Analisi completa codice+DB"  (mode: "analysis")
 *   • "Genera manuale"              (mode: "manual")
 *
 * Avanzamento live (stato, chunk elaborati, file processati) via polling di
 * GET /api/admin/ares/jobs. Un job in corso si può interrompere con "Ferma".
 * A completamento: le proposte dell'analisi sono leggibili inline, il manuale
 * rimanda alla schermata Nadir e la versione precedente è recuperabile via
 * GET /api/admin/ares/manual/previous.
 *
 * Backend: server/routes/admin/ares-jobs.ts. Ares resta in SOLA LETTURA
 * (l'unica scrittura è il manuale nello storage di Nadir). Nessun avvio
 * automatico: i job partono SOLO da qui, da un'azione admin o da Bowie.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
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

type JobMode = "analysis" | "manual";
type JobStatus = "idle" | "running" | "completed" | "failed" | "interrupted";

interface AresJobState {
  mode: JobMode;
  status: JobStatus;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  startedBy: string | null;
  trigger: string | null;
  model: string | null;
  cursor: number;
  totalChunks: number;
  totalFiles: number;
  processedFiles: number;
  error: string | null;
  liveInProcess: boolean;
  // analysis
  report?: string | null;
  // manual
  manualLength?: number;
  previousManualLength?: number | null;
  reindexed?: boolean;
}

type JobsResponse = Record<JobMode, AresJobState>;

interface StartResponse {
  started: boolean;
  reason?: string | null;
  mode: JobMode;
}

interface PreviousManualResponse {
  hasPrevious: boolean;
  savedAt: string | null;
  length: number;
  text: string;
}

function fmtDate(iso: string | number | null | undefined): string {
  if (iso == null) return "mai";
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return String(iso);
  }
}

const STATUS_META: Record<
  JobStatus,
  { label: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  idle: { label: "In attesa", color: Colors.textSecondary, icon: "circle-outline" },
  running: { label: "In corso", color: Colors.primary, icon: "progress-clock" },
  completed: { label: "Completato", color: Colors.success, icon: "check-circle" },
  failed: { label: "Fallito", color: Colors.error, icon: "alert-circle" },
  interrupted: { label: "Interrotto", color: Colors.warning, icon: "pause-circle" },
};

const ARES_COLOR = "#E63946";

export default function AresJobsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const statusQuery = useQuery<JobsResponse>({
    queryKey: ["/api/admin/ares/jobs"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ares/jobs")).json(),
    staleTime: 3_000,
    refetchInterval: 5_000,
  });

  const startMutation = useMutation<StartResponse, Error, JobMode>({
    mutationFn: async (mode: JobMode) =>
      (await apiRequest("POST", `/api/admin/ares/jobs/${mode}/start`)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ares/jobs"] });
    },
  });

  const stopMutation = useMutation<{ stopped: boolean }, Error, JobMode>({
    mutationFn: async (mode: JobMode) =>
      (await apiRequest("POST", `/api/admin/ares/jobs/${mode}/stop`)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ares/jobs"] });
    },
  });

  const previousManualQuery = useQuery<PreviousManualResponse>({
    queryKey: ["/api/admin/ares/manual/previous"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/ares/manual/previous")).json(),
    enabled: false,
  });

  const [pendingMode, setPendingMode] = useState<JobMode | null>(null);
  const [lastNotStarted, setLastNotStarted] = useState<{ mode: JobMode; reason: string } | null>(
    null,
  );

  const start = (mode: JobMode) => {
    setPendingMode(mode);
    setLastNotStarted(null);
    startMutation.mutate(mode, {
      onSuccess: (res) => {
        if (!res.started) {
          setLastNotStarted({ mode, reason: res.reason ?? "non avviato" });
        }
      },
      onSettled: () => setPendingMode(null),
    });
  };

  const stop = (mode: JobMode) => {
    setPendingMode(mode);
    stopMutation.mutate(mode, { onSettled: () => setPendingMode(null) });
  };

  const data = statusQuery.data;
  const analysis = data?.analysis;
  const manual = data?.manual;
  const previous = previousManualQuery.data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
    >
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="robot-industrial" size={26} color={ARES_COLOR} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Ares — Job on-demand</Text>
          <Text style={styles.subtitle}>
            Analisi completa e generazione manuale, eseguite da Ares (sola lettura). Nessun avvio
            automatico.
          </Text>
        </View>
      </View>

      {/* ── Analisi codice + DB ── */}
      <JobCard
        title="Analisi completa codice+DB"
        description="Ares legge tutto il codice locale + integrità DB e produce una sintesi con proposte azionabili."
        icon="magnify-scan"
        state={analysis}
        starting={pendingMode === "analysis" && startMutation.isPending}
        stopping={pendingMode === "analysis" && stopMutation.isPending}
        disabledOther={pendingMode === "manual" && (startMutation.isPending || stopMutation.isPending)}
        notStartedReason={lastNotStarted?.mode === "analysis" ? lastNotStarted.reason : null}
        onStart={() => start("analysis")}
        onStop={() => stop("analysis")}
        buttonLabel="Avvia analisi"
        testID="ares-jobs-analysis"
      />

      {/* Risultato analisi */}
      {analysis?.status === "completed" && analysis.report ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Proposte ultima analisi</Text>
          <Row label="Completata" value={fmtDate(analysis.completedAt)} />
          <Row label="Modello" value={analysis.model ?? "—"} mono />
          <CollapsibleText text={analysis.report} testID="ares-jobs-analysis-report" />
        </View>
      ) : null}

      {/* ── Manuale ── */}
      <JobCard
        title="Genera manuale"
        description="Ares descrive l'intera app per funzionalità e salva il manuale nello storage di Nadir (poi reindicizzato)."
        icon="book-open-variant"
        state={manual}
        starting={pendingMode === "manual" && startMutation.isPending}
        stopping={pendingMode === "manual" && stopMutation.isPending}
        disabledOther={
          pendingMode === "analysis" && (startMutation.isPending || stopMutation.isPending)
        }
        notStartedReason={lastNotStarted?.mode === "manual" ? lastNotStarted.reason : null}
        onStart={() => start("manual")}
        onStop={() => stop("manual")}
        buttonLabel="Genera manuale"
        testID="ares-jobs-manual"
      />

      {/* Manuale generato */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Manuale generato</Text>
        <Row
          label="Lunghezza testo"
          value={manual?.manualLength ? `${manual.manualLength} caratteri` : "—"}
        />
        <Row
          label="Versione precedente"
          value={
            manual?.previousManualLength
              ? `${manual.previousManualLength} caratteri`
              : "—"
          }
        />
        <Row
          label="Reindicizzato in Nadir"
          value={manual?.reindexed ? "sì" : manual?.status === "completed" ? "no" : "—"}
        />

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, { marginTop: 12 }]}
          onPress={() => router.push("/admin/nadir" as Href)}
          testID="ares-jobs-open-manual"
        >
          <MaterialCommunityIcons name="open-in-new" size={18} color={Colors.primary} />
          <Text style={[styles.btnText, { color: Colors.primary }]}>Apri manuale (Nadir)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, { marginTop: 8 }]}
          onPress={() => previousManualQuery.refetch()}
          disabled={previousManualQuery.isFetching}
          testID="ares-jobs-load-previous"
        >
          {previousManualQuery.isFetching ? (
            <ActivityIndicator color={Colors.primary} size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="history" size={18} color={Colors.primary} />
              <Text style={[styles.btnText, { color: Colors.primary }]}>
                Recupera versione precedente
              </Text>
            </>
          )}
        </TouchableOpacity>

        {previousManualQuery.isFetched && previous ? (
          previous.hasPrevious ? (
            <View style={{ marginTop: 12 }}>
              <Row label="Salvato" value={fmtDate(previous.savedAt)} />
              <Row label="Lunghezza" value={`${previous.length} caratteri`} />
              <CollapsibleText text={previous.text} testID="ares-jobs-previous-text" />
            </View>
          ) : (
            <Text style={styles.hint}>Nessuna versione precedente del manuale disponibile.</Text>
          )
        ) : null}
        {previousManualQuery.isError ? (
          <Text style={styles.errText}>Errore lettura versione precedente.</Text>
        ) : null}
      </View>

      {statusQuery.isError ? (
        <Text style={styles.errText}>Errore lettura stato job Ares.</Text>
      ) : null}
    </ScrollView>
  );
}

function JobCard({
  title,
  description,
  icon,
  state,
  starting,
  stopping,
  disabledOther,
  notStartedReason,
  onStart,
  onStop,
  buttonLabel,
  testID,
}: {
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  state: AresJobState | undefined;
  starting: boolean;
  stopping: boolean;
  disabledOther: boolean;
  notStartedReason: string | null;
  onStart: () => void;
  onStop: () => void;
  buttonLabel: string;
  testID: string;
}) {
  const status = state?.status ?? "idle";
  const meta = STATUS_META[status];
  const isRunning = status === "running";
  const progress =
    state && state.totalChunks > 0 ? Math.round((state.cursor / state.totalChunks) * 100) : 0;
  const startDisabled = starting || stopping || isRunning || disabledOther;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <MaterialCommunityIcons name={icon} size={22} color={ARES_COLOR} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.hint}>{description}</Text>

      <View style={styles.statusRow}>
        <MaterialCommunityIcons name={meta.icon} size={20} color={meta.color} />
        <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        {state && state.totalChunks > 0 ? (
          <Text style={styles.progressPct}>{progress}%</Text>
        ) : null}
      </View>

      {state && state.totalChunks > 0 ? (
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progress}%`, backgroundColor: meta.color }]}
          />
        </View>
      ) : null}

      <Row
        label="Chunk"
        value={state ? `${state.cursor} / ${state.totalChunks}` : "0 / 0"}
      />
      <Row
        label="File processati"
        value={state ? `${state.processedFiles} / ${state.totalFiles}` : "0 / 0"}
      />
      {state?.trigger ? <Row label="Avviato da" value={state.trigger} /> : null}
      <Row label="Avviato" value={fmtDate(state?.startedAt)} />
      <Row label="Terminato" value={fmtDate(state?.completedAt)} />
      {state?.error ? <Text style={styles.errText}>{state.error}</Text> : null}
      {notStartedReason ? (
        <Text style={styles.warnText}>Non avviato: {notStartedReason}</Text>
      ) : null}

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnPrimary,
            styles.btnFlex,
            startDisabled && styles.btnDisabled,
          ]}
          onPress={onStart}
          disabled={startDisabled}
          testID={`${testID}-start`}
        >
          {starting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="play" size={18} color="#fff" />
              <Text style={styles.btnText}>{isRunning ? "In corso…" : buttonLabel}</Text>
            </>
          )}
        </TouchableOpacity>

        {isRunning ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnStop, styles.btnFlex, stopping && styles.btnDisabled]}
            onPress={onStop}
            disabled={stopping}
            testID={`${testID}-stop`}
          >
            {stopping ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="stop" size={18} color="#fff" />
                <Text style={styles.btnText}>Ferma</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function CollapsibleText({ text, testID }: { text: string; testID: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.length > 500 && !expanded ? text.slice(0, 500) + "…" : text;
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.body}>{preview}</Text>
      {text.length > 500 ? (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} testID={testID}>
          <Text style={styles.linkText}>{expanded ? "Mostra meno" : "Mostra tutto"}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]} numberOfLines={mono ? 1 : 2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 8,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    lineHeight: 19,
    marginTop: 8,
  },
  linkText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
    marginTop: 6,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  progressPct: { fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.text },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressFill: { height: "100%", borderRadius: 4 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnFlex: { flex: 1 },
  btnPrimary: { backgroundColor: Colors.primary },
  btnSecondary: { borderWidth: 1, borderColor: Colors.primary },
  btnStop: { backgroundColor: Colors.error },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1 },
  rowValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
    textAlign: "right",
    flexShrink: 1,
    marginLeft: 12,
  },
  rowValueMono: { fontFamily: "Inter_400Regular", fontSize: 12 },
  errText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.error,
    marginTop: 8,
  },
  warnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.warning,
    marginTop: 8,
  },
});
