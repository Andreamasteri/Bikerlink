/**
 * Task #91 — Pannello admin per le due scansioni complete on-demand di Horus.
 *
 * Card dedicata (finora si poteva lanciare solo da chat o azione generica). Due
 * pulsanti che POSTano su /api/admin/horus-scan/start con { mode }:
 *   • "Analisi completa codice+DB"  (mode: "analysis")
 *   • "Genera manuale"              (mode: "manual")
 *
 * Avanzamento live (file letti / saltati / pendenti, stato, ultimo esito) via
 * polling di GET /api/admin/horus-scan/status. Espone anche un collegamento al
 * manuale generato (schermata Nadir) e alle ultime proposte dell'analisi.
 *
 * Backend: server/routes/admin/horus-scan.ts. Horus resta in SOLA LETTURA.
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

type ScanMode = "analysis" | "manual";
type ScanStatus = "idle" | "running" | "completed" | "interrupted" | "error";

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

  const [pendingMode, setPendingMode] = useState<ScanMode | null>(null);
  const [lastNotStarted, setLastNotStarted] = useState<{ mode: ScanMode; reason: string } | null>(
    null,
  );

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

  const data = statusQuery.data;
  const analysis = data?.scans?.analysis;
  const manual = data?.scans?.manual;
  const lastAnalysis = data?.lastAnalysis ?? null;
  const manualInfo = data?.manual;

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

      {/* Manuale generato */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Manuale generato</Text>
        <Row label="Lunghezza testo" value={`${manualInfo?.length ?? 0} caratteri`} />
        <Row label="Versione precedente" value={manualInfo?.hasPrevious ? "presente" : "—"} />
        {manualInfo?.previousSavedAt ? (
          <Row label="Precedente salvato" value={fmtDate(manualInfo.previousSavedAt)} />
        ) : null}
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, { marginTop: 12 }]}
          onPress={() => router.push("/admin/nadir" as Href)}
          testID="horus-scan-open-manual"
        >
          <MaterialCommunityIcons name="open-in-new" size={18} color={Colors.primary} />
          <Text style={[styles.btnText, { color: Colors.primary }]}>Apri manuale (Nadir)</Text>
        </TouchableOpacity>
      </View>

      {statusQuery.isError ? (
        <Text style={styles.errText}>Errore lettura stato scansioni.</Text>
      ) : null}
    </ScrollView>
  );
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

      <Row label="File totali" value={String(state?.filesTotal ?? 0)} />
      <Row label="Analizzati" value={String(state?.filesAnalyzed ?? 0)} />
      <Row label="Saltati" value={String(state?.filesSkipped ?? 0)} />
      <Row label="Pendenti" value={String(state?.filesPending ?? 0)} />
      {state?.lastFile ? <Row label="Ultimo file" value={state.lastFile} mono /> : null}
      <Row label="Avviata" value={fmtDate(state?.startedAt)} />
      <Row label="Terminata" value={fmtDate(state?.finishedAt)} />
      {state?.resultSummary ? <Text style={styles.body}>{state.resultSummary}</Text> : null}
      {state?.lastError ? (
        <Text style={styles.errText}>
          {fmtDate(state.lastError.at)}: {state.lastError.message}
        </Text>
      ) : null}
      {notStartedReason ? (
        <Text style={styles.warnText}>Non avviata: {notStartedReason}</Text>
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
    marginTop: 8,
  },
  warnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.warning,
    marginTop: 8,
  },
});
