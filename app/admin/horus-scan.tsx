/**
 * Task #91 — Pannello admin per le due scansioni complete on-demand di Horus.
 * Task #614 — "Genera Manuale" pipeline completa: avanzamento live + ETA +
 *             push a Bowie/Horus + errori Ollama/ai-hub inline.
 *
 * Card dedicata (finora si poteva lanciare solo da chat o azione generica). Due
 * pulsanti che POSTano su /api/admin/horus-scan/start con { mode }:
 *   • "Analisi completa codice+DB"  (mode: "analysis")
 *   • "Genera manuale"              (mode: "manual")
 *
 * Avanzamento live (file letti / saltati / pendenti, stato, ETA, ultimo esito)
 * via polling di GET /api/admin/horus-scan/status. A scan completata: pulsanti
 * "Push a Bowie" e "Push a Horus" (POST /api/admin/horus-scan/push).
 * Errori Ollama/ai-hub mostrati inline nella card, non solo nei log server.
 *
 * Backend: server/routes/admin/horus-scan.ts. Horus resta in SOLA LETTURA.
 */
import React, { useState, useRef } from "react";
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

type ScanMode = "analysis" | "manual";
type ScanStatus = "idle" | "running" | "completed" | "interrupted" | "error";
type PushTarget = "bowie" | "horus";

interface ScanState {
  mode: ScanMode;
  status: ScanStatus;
  startedAt: number | null;
  finishedAt: number | null;
  filesTotal: number;
  filesAnalyzed: number;
  filesSkipped: number;
  filesPending: number;
  lastFile: string | null;
  lastError: { at: string; message: string } | null;
  resultSummary: string | null;
}

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

function fmtDate(iso: string | number | null | undefined): string {
  if (iso == null) return "mai";
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return String(iso);
  }
}

const STATUS_META: Record<
  ScanStatus,
  { label: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  idle: { label: "In attesa", color: Colors.textSecondary, icon: "circle-outline" },
  running: { label: "In corso", color: Colors.primary, icon: "progress-clock" },
  completed: { label: "Completata", color: Colors.success, icon: "check-circle" },
  interrupted: { label: "Interrotta", color: Colors.warning, icon: "pause-circle" },
  error: { label: "Errore", color: Colors.error, icon: "alert-circle" },
};

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
      onSuccess: (_res) => {
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

  // Mostra i pulsanti push quando il manuale è stato generato almeno una volta
  // e non c'è una scan manual in corso.
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

        {/* Risultato scan completata */}
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

        {/* Push a Bowie / Horus — visibili quando il manuale esiste */}
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

            {/* Feedback push inline */}
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

/** Formatta secondi in "X min Y s" oppure "Y s". */
function fmtDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)} s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return s > 0 ? `${m} min ${s} s` : `${m} min`;
}

/**
 * Stima ETA in secondi rimanenti sulla base del tempo trascorso e della
 * percentuale completata. Restituisce null se non calcolabile.
 */
function computeEta(state: ScanState): number | null {
  if (state.status !== "running") return null;
  const done = state.filesAnalyzed + state.filesSkipped;
  if (!state.startedAt || !state.filesTotal || done === 0) return null;
  const elapsedMs = Date.now() - state.startedAt;
  const totalEstimatedMs = (elapsedMs / done) * state.filesTotal;
  const remaining = (totalEstimatedMs - elapsedMs) / 1000;
  return remaining > 0 ? remaining : null;
}

function ScanCard({
  title,
  description,
  icon,
  state,
  starting,
  disabledOther,
  notStartedReason,
  onStart,
  buttonLabel,
  testID,
}: {
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  state: ScanState | undefined;
  starting: boolean;
  disabledOther: boolean;
  notStartedReason: string | null;
  onStart: () => void;
  buttonLabel: string;
  testID: string;
}) {
  const status = state?.status ?? "idle";
  const meta = STATUS_META[status];
  const isRunning = status === "running";
  const progress =
    state && state.filesTotal > 0
      ? Math.round(((state.filesAnalyzed + state.filesSkipped) / state.filesTotal) * 100)
      : 0;
  const disabled = starting || isRunning || disabledOther;
  const eta = state ? computeEta(state) : null;

  // Classifica errori Ollama / ai-hub per messaggio inline chiaro
  const errorMsg = state?.lastError?.message ?? "";
  const isOllamaError =
    errorMsg.toLowerCase().includes("ollama") ||
    errorMsg.toLowerCase().includes("horus") ||
    errorMsg.toLowerCase().includes("raggiungibile") ||
    errorMsg.toLowerCase().includes("reachable");
  const isHubError =
    errorMsg.toLowerCase().includes("hub") ||
    errorMsg.toLowerCase().includes("ai-hub") ||
    errorMsg.toLowerCase().includes("storage");

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <MaterialCommunityIcons name={icon} size={22} color="#0EA5E9" />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.hint}>{description}</Text>

      <View style={styles.statusRow}>
        <MaterialCommunityIcons name={meta.icon} size={20} color={meta.color} />
        <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        {state && state.filesTotal > 0 ? (
          <Text style={styles.progressPct}>{progress}%</Text>
        ) : null}
      </View>

      {state && state.filesTotal > 0 ? (
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progress}%`, backgroundColor: meta.color }]}
          />
        </View>
      ) : null}

      {/* ETA in tempo reale (solo durante la scan) */}
      {isRunning && eta !== null ? (
        <View style={styles.etaRow}>
          <MaterialCommunityIcons name="timer-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.etaText}>ETA ~{fmtDuration(eta)}</Text>
        </View>
      ) : null}

      <Row label="File totali" value={String(state?.filesTotal ?? 0)} />
      <Row label="Analizzati" value={String(state?.filesAnalyzed ?? 0)} />
      <Row label="Saltati" value={String(state?.filesSkipped ?? 0)} />
      <Row label="Pendenti" value={String(state?.filesPending ?? 0)} />
      {state?.lastFile ? <Row label="Ultimo file" value={state.lastFile} mono /> : null}
      <Row label="Avviata" value={fmtDate(state?.startedAt)} />
      <Row label="Terminata" value={fmtDate(state?.finishedAt)} />
      {state?.resultSummary && status !== "completed" ? (
        <Text style={styles.body}>{state.resultSummary}</Text>
      ) : null}

      {/* Errore Ollama — messaggio contestuale */}
      {state?.lastError ? (
        <View style={styles.errorBox}>
          <MaterialCommunityIcons name="alert-circle" size={16} color={Colors.error} />
          <View style={{ flex: 1 }}>
            {isOllamaError ? (
              <Text style={[styles.hint, { color: Colors.error, marginBottom: 2 }]}>
                Ollama / ThinkCentre non raggiungibile. Verifica che il TC sia online e riprova.
              </Text>
            ) : isHubError ? (
              <Text style={[styles.hint, { color: Colors.warning, marginBottom: 2 }]}>
                ai-hub offline — il manuale è salvato su Replit, il TC sarà sincronizzato alla prossima scan.
              </Text>
            ) : null}
            <Text style={styles.errText}>
              {fmtDate(state.lastError.at)}: {state.lastError.message}
            </Text>
          </View>
        </View>
      ) : null}

      {notStartedReason ? (
        <View style={styles.errorBox}>
          <MaterialCommunityIcons name="information" size={16} color={Colors.warning} />
          <Text style={[styles.warnText, { flex: 1, marginTop: 0 }]}>
            {notStartedReason.toLowerCase().includes("ollama") ||
            notStartedReason.toLowerCase().includes("raggiungibile")
              ? `ThinkCentre / Ollama non raggiungibile: ${notStartedReason}`
              : `Non avviata: ${notStartedReason}`}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.btn, styles.btnPrimary, disabled && styles.btnDisabled, { marginTop: 12 }]}
        onPress={onStart}
        disabled={disabled}
        testID={testID}
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
    </View>
  );
}

function ProposalsBlock({ proposals }: { proposals: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = proposals.length > 400 && !expanded ? proposals.slice(0, 400) + "…" : proposals;
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.proposals}>{preview}</Text>
      {proposals.length > 400 ? (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} testID="horus-scan-toggle-proposals">
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
    marginTop: 8,
  },
  proposals: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    lineHeight: 18,
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
  btn: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: Colors.primary },
  btnSecondary: { borderWidth: 1, borderColor: Colors.primary },
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
    marginTop: 4,
  },
  warnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.warning,
    marginTop: 4,
  },
  // ETA
  etaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  etaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  // Errore/info box contestuale
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  // resultSummary completata
  resultBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  // Sezione Push
  pushDivider: {
    marginTop: 18,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  pushDividerLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  pushHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  pushRow: {
    flexDirection: "row",
    gap: 10,
  },
  btnPush: {
    backgroundColor: "#0369A1",
  },
  btnPushSecondary: {
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  pushFeedback: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
});
