/**
 * Task #614 — Sub-componenti, helper e stili estratti da app/admin/horus-scan.tsx
 * per rispettare il ratchet 650 righe.
 * Esportati: ScanMode, ScanStatus, ScanState, STATUS_META, fmtDate, fmtDuration,
 *            computeEta, ScanCard, ProposalsBlock, Row, horusScanStyles.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type ScanMode = "analysis" | "manual";
export type ScanStatus = "idle" | "running" | "completed" | "interrupted" | "error";

export interface ScanState {
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

export const STATUS_META: Record<
  ScanStatus,
  { label: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  idle: { label: "In attesa", color: Colors.textSecondary, icon: "circle-outline" },
  running: { label: "In corso", color: Colors.primary, icon: "progress-clock" },
  completed: { label: "Completata", color: Colors.success, icon: "check-circle" },
  interrupted: { label: "Interrotta", color: Colors.warning, icon: "pause-circle" },
  error: { label: "Errore", color: Colors.error, icon: "alert-circle" },
};

export function fmtDate(iso: string | number | null | undefined): string {
  if (iso == null) return "mai";
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return String(iso);
  }
}

export function fmtDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)} s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return s > 0 ? `${m} min ${s} s` : `${m} min`;
}

export function computeEta(state: ScanState): number | null {
  if (state.status !== "running") return null;
  const done = state.filesAnalyzed + state.filesSkipped;
  if (!state.startedAt || !state.filesTotal || done === 0) return null;
  const elapsedMs = Date.now() - state.startedAt;
  const totalEstimatedMs = (elapsedMs / done) * state.filesTotal;
  const remaining = (totalEstimatedMs - elapsedMs) / 1000;
  return remaining > 0 ? remaining : null;
}

export function ScanCard({
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

  const s = horusScanStyles;
  return (
    <View style={s.card}>
      <View style={s.cardHeaderRow}>
        <MaterialCommunityIcons name={icon} size={22} color="#0EA5E9" />
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      <Text style={s.hint}>{description}</Text>

      <View style={s.statusRow}>
        <MaterialCommunityIcons name={meta.icon} size={20} color={meta.color} />
        <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
        {state && state.filesTotal > 0 ? (
          <Text style={s.progressPct}>{progress}%</Text>
        ) : null}
      </View>

      {state && state.filesTotal > 0 ? (
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress}%`, backgroundColor: meta.color }]} />
        </View>
      ) : null}

      {isRunning && eta !== null ? (
        <View style={s.etaRow}>
          <MaterialCommunityIcons name="timer-outline" size={14} color={Colors.textSecondary} />
          <Text style={s.etaText}>ETA ~{fmtDuration(eta)}</Text>
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
        <Text style={s.body}>{state.resultSummary}</Text>
      ) : null}

      {state?.lastError ? (
        <View style={s.errorBox}>
          <MaterialCommunityIcons name="alert-circle" size={16} color={Colors.error} />
          <View style={{ flex: 1 }}>
            {isOllamaError ? (
              <Text style={[s.hint, { color: Colors.error, marginBottom: 2 }]}>
                Ollama / ThinkCentre non raggiungibile. Verifica che il TC sia online e riprova.
              </Text>
            ) : isHubError ? (
              <Text style={[s.hint, { color: Colors.warning, marginBottom: 2 }]}>
                ai-hub offline — il manuale è salvato su Replit, il TC sarà sincronizzato alla prossima scan.
              </Text>
            ) : null}
            <Text style={s.errText}>
              {fmtDate(state.lastError.at)}: {state.lastError.message}
            </Text>
          </View>
        </View>
      ) : null}

      {notStartedReason ? (
        <View style={s.errorBox}>
          <MaterialCommunityIcons name="information" size={16} color={Colors.warning} />
          <Text style={[s.warnText, { flex: 1, marginTop: 0 }]}>
            {notStartedReason.toLowerCase().includes("ollama") ||
            notStartedReason.toLowerCase().includes("raggiungibile")
              ? `ThinkCentre / Ollama non raggiungibile: ${notStartedReason}`
              : `Non avviata: ${notStartedReason}`}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[s.btn, s.btnPrimary, disabled && s.btnDisabled, { marginTop: 12 }]}
        onPress={onStart}
        disabled={disabled}
        testID={testID}
      >
        {starting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="play" size={18} color="#fff" />
            <Text style={s.btnText}>{isRunning ? "In corso…" : buttonLabel}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

export function ProposalsBlock({ proposals }: { proposals: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = proposals.length > 400 && !expanded ? proposals.slice(0, 400) + "…" : proposals;
  const s = horusScanStyles;
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={s.proposals}>{preview}</Text>
      {proposals.length > 400 ? (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} testID="horus-scan-toggle-proposals">
          <Text style={s.linkText}>{expanded ? "Mostra meno" : "Mostra tutto"}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const s = horusScanStyles;
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, mono && s.rowValueMono]} numberOfLines={mono ? 1 : 2}>
        {value}
      </Text>
    </View>
  );
}

export const horusScanStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, marginBottom: 8 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
  body: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text, marginTop: 8 },
  proposals: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text, lineHeight: 18 },
  linkText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.primary, marginTop: 6 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  progressPct: { fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.text },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: "hidden", marginBottom: 10 },
  progressFill: { height: "100%", borderRadius: 4 },
  btn: { flexDirection: "row", gap: 8, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: Colors.primary },
  btnSecondary: { borderWidth: 1, borderColor: Colors.primary },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1 },
  rowValue: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, textAlign: "right", flexShrink: 1, marginLeft: 12 },
  rowValueMono: { fontFamily: "Inter_400Regular", fontSize: 12 },
  errText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.error, marginTop: 4 },
  warnText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.warning, marginTop: 4 },
  etaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  etaText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.08)" },
  resultBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: "rgba(34,197,94,0.08)" },
  pushDivider: { marginTop: 18, marginBottom: 4, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  pushDividerLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  pushHint: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
  pushRow: { flexDirection: "row", gap: 10 },
  btnPush: { backgroundColor: "#0369A1" },
  btnPushSecondary: { borderWidth: 1, borderColor: Colors.primary },
  pushFeedback: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1 },
});
