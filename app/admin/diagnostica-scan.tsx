// Task #4825 — Tab "Scan" della Diagnostica admin.
// Toggle checker (default ON), selettore provider AI (con stato live), modalità
// (Solo analisi / Analisi + Fix), avvio scan con progresso realtime per-checker,
// risultati raggruppati per severità con badge safe/risky deterministici, azioni
// (crea task, salva log, invia all'assistente, esporta JSON). Costo zero.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import s from "@/components/admin/diagnostica-styles";
import { adminFetch } from "./diagnostica-types";
import { copyLogToClipboard } from "@/lib/copyAdminLog";
import AiCopilotDrawer from "@/components/admin/ai/AiCopilotDrawer";
import {
  streamHealthCheck,
  type AiProviderChoice,
  type CheckResult,
  type HealthCheckReport,
  type Severity,
} from "@/lib/admin/health-check-stream";

interface CheckerMeta { id: string; label: string; category: string }
interface AiProviderStatus {
  id: string; label: string; configured: boolean; available: boolean; detail: string;
}

const PROVIDER_ORDER: AiProviderChoice[] = ["ollama", "groq", "gemini", "openai"];
const SEVERITY_ORDER: Severity[] = ["critical", "warning", "info"];
const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "#ef4444", warning: "#f59e0b", info: "#3b82f6",
};
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critici", warning: "Avvisi", info: "Info",
};

function providerDot(p: AiProviderStatus | undefined): string {
  if (!p || !p.configured) return Colors.textSecondary;
  return p.available ? "#22c55e" : "#ef4444";
}

// ─── singolo risultato ─────────────────────────────────────────────────────────
function ResultCard({
  item, fixMode, onCreateTask,
}: { item: CheckResult; fixMode: boolean; onCreateTask: (i: CheckResult) => void }) {
  const [showDiff, setShowDiff] = useState(false);
  const loc = item.file
    ? `${item.file}${item.line ? `:${item.line}` : ""}${item.column ? `:${item.column}` : ""}`
    : null;
  const safe = item.safeFix === true;
  return (
    <View style={[s.scanResultCard, { borderLeftColor: SEVERITY_COLOR[item.severity] }]}>
      <View style={s.scanResultHeaderRow}>
        <Text style={s.scanResultCheckId}>{item.checkId}</Text>
        <View style={[s.scanBadge, { backgroundColor: safe ? "#22c55e22" : "#ef444422" }]}>
          <Text style={[s.scanBadgeText, { color: safe ? "#16a34a" : "#dc2626" }]}>
            {safe ? "🟢 safe-fix" : "🔴 review"}
          </Text>
        </View>
      </View>
      {loc ? <Text style={s.scanResultFile}>{loc}</Text> : null}
      <Text style={s.scanResultDesc}>{item.description}</Text>
      {item.evidence ? (
        <Text style={s.scanResultEvidence} numberOfLines={6}>{item.evidence}</Text>
      ) : null}

      {/* Diff AI per-anomalia (fix mode, per OGNI problema con diff proposto) */}
      {fixMode && item.aiDiff ? (
        <View style={s.scanDiffBox}>
          <TouchableOpacity style={s.scanDiffToggle} onPress={() => setShowDiff((v) => !v)} activeOpacity={0.75}>
            <Ionicons name={showDiff ? "chevron-up" : "chevron-down"} size={13} color={Colors.accent} />
            <Text style={s.scanDiffToggleText}>Diff AI proposto</Text>
          </TouchableOpacity>
          {showDiff ? <Text style={s.scanDiffText}>{item.aiDiff}</Text> : null}
        </View>
      ) : null}

      {safe ? (
        <TouchableOpacity style={s.scanTaskBtn} onPress={() => onCreateTask(item)} activeOpacity={0.75}>
          <Ionicons name="add-circle-outline" size={13} color={Colors.accent} />
          <Text style={s.scanTaskBtnText}>Crea task per questo fix</Text>
        </TouchableOpacity>
      ) : (
        <Text style={s.scanReviewHint}>🔴 Revisione manuale richiesta — nessun task automatico</Text>
      )}
    </View>
  );
}

export function TabScan() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState<AiProviderChoice | null>(null);
  const [mode, setMode] = useState<"analysis" | "fix">("analysis");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [aiRunning, setAiRunning] = useState(false);
  const [report, setReport] = useState<HealthCheckReport | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMsg, setAssistantMsg] = useState<string | undefined>(undefined);
  const [providerTouched, setProviderTouched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { data: checkersData } = useQuery<{ checkers: CheckerMeta[] }>({
    queryKey: ["/api/admin/health-check/checkers"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/health-check/checkers");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 5 * 60_000,
  });

  const { data: aiStatus } = useQuery<{ providers: AiProviderStatus[] }>({
    queryKey: ["/api/admin/health-check/ai-status"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/health-check/ai-status");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  const checkers = useMemo(() => checkersData?.checkers ?? [], [checkersData]);
  const statusById = useMemo(() => {
    const m = new Map<string, AiProviderStatus>();
    for (const p of aiStatus?.providers ?? []) m.set(p.id, p);
    return m;
  }, [aiStatus]);

  const isProviderAvailable = useCallback(
    (id: AiProviderChoice) => {
      const st = statusById.get(id);
      return Boolean(st?.configured && st?.available);
    },
    [statusById],
  );

  // Pre-seleziona automaticamente il primo provider disponibile (finché l'admin
  // non sceglie manualmente). Se nessuno è disponibile resta "Nessuno".
  useEffect(() => {
    if (providerTouched) return;
    if (provider && isProviderAvailable(provider)) return;
    const first = PROVIDER_ORDER.find((id) => isProviderAvailable(id)) ?? null;
    setProvider(first);
  }, [providerTouched, provider, isProviderAvailable]);

  // Default: tutti i checker ON la prima volta che arrivano.
  const isChecked = useCallback(
    (id: string) => enabled[id] ?? true,
    [enabled],
  );
  const toggle = useCallback((id: string) => {
    setEnabled((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  const selectedIds = useMemo(
    () => checkers.filter((c) => isChecked(c.id)).map((c) => c.id),
    [checkers, isChecked],
  );

  const grouped = useMemo(() => {
    const all: CheckResult[] = [];
    for (const c of report?.checkers ?? []) all.push(...c.results);
    const by: Record<Severity, CheckResult[]> = { critical: [], warning: [], info: [] };
    for (const r of all) by[r.severity].push(r);
    return by;
  }, [report]);

  const runScan = useCallback(async () => {
    if (running || selectedIds.length === 0) return;
    setRunning(true);
    setReport(null);
    setProgress({});
    setAiRunning(false);
    setShowAi(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamHealthCheck(
        { checkerIds: selectedIds, mode, aiProvider: provider },
        {
          signal: ctrl.signal,
          onStart: (ev) => {
            const init: Record<string, string> = {};
            for (const id of ev.checkerIds) init[id] = "pending";
            setProgress(init);
          },
          onProgress: (ev) =>
            setProgress((p) => ({ ...p, [ev.checkerId]: ev.status })),
          onScanDone: (r) => setReport(r),
          onAiStart: () => setAiRunning(true),
          onDone: (r) => { setReport(r); setAiRunning(false); },
          onError: (e) => Alert.alert("Scan", e.message),
        },
      );
    } catch (e) {
      Alert.alert("Scan", (e as Error).message);
    } finally {
      setRunning(false);
      setAiRunning(false);
      abortRef.current = null;
    }
  }, [running, selectedIds, mode, provider]);

  const createTask = useCallback(async (item: CheckResult) => {
    setBusyAction("task");
    try {
      const loc = item.file ? ` (${item.file}${item.line ? `:${item.line}` : ""})` : "";
      const diffBlock = item.aiDiff ? `\n\nDiff AI proposto:\n${item.aiDiff}` : "";
      const r = await adminFetch("/api/admin/health-check/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `[${item.severity}] ${item.checkId}${loc}`,
          message: `${item.description}\n\n${item.evidence ?? ""}${diffBlock}`.trim(),
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      Alert.alert("Task", "Task creato.");
    } catch (e) {
      Alert.alert("Task", (e as Error).message);
    } finally {
      setBusyAction(null);
    }
  }, []);

  const createAllSafe = useCallback(async () => {
    const safe: CheckResult[] = [];
    for (const c of report?.checkers ?? []) for (const r of c.results) if (r.safeFix) safe.push(r);
    if (safe.length === 0) { Alert.alert("Task", "Nessun fix sicuro da creare."); return; }
    setBusyAction("allSafe");
    try {
      const items = safe.map((item) => {
        const loc = item.file ? ` (${item.file}${item.line ? `:${item.line}` : ""})` : "";
        const diffBlock = item.aiDiff ? `\n\nDiff AI proposto:\n${item.aiDiff}` : "";
        return {
          subject: `[safe] ${item.checkId}${loc}`,
          message: `${item.description}\n\n${item.evidence ?? ""}${diffBlock}`.trim(),
        };
      });
      const r = await adminFetch("/api/admin/health-check/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { created: number };
      Alert.alert("Task", `${j.created} task sicuri creati.`);
    } catch (e) {
      Alert.alert("Task", (e as Error).message);
    } finally {
      setBusyAction(null);
    }
  }, [report]);

  const saveLog = useCallback(async () => {
    if (!report) return;
    setBusyAction("save");
    try {
      const r = await adminFetch("/api/admin/health-check/save-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { filename: string };
      Alert.alert("Salva log", `Salvato: ${j.filename}`);
    } catch (e) {
      Alert.alert("Salva log", (e as Error).message);
    } finally {
      setBusyAction(null);
    }
  }, [report]);

  const sendToAssistant = useCallback(() => {
    if (!report) return;
    const lines: string[] = [
      `Health Check Scan ${report.runId}`,
      `${report.summary.critical} critici · ${report.summary.warning} avvisi · ${report.summary.info} info`,
      report.aiAnalysis ? `\nAnalisi AI:\n${report.aiAnalysis}` : "",
      "",
      ...grouped.critical.slice(0, 50).map((r) => `❌ ${r.checkId} ${r.file ?? ""}${r.line ? `:${r.line}` : ""} — ${r.description}`),
      ...grouped.warning.slice(0, 50).map((r) => `⚠️ ${r.checkId} ${r.file ?? ""}${r.line ? `:${r.line}` : ""} — ${r.description}`),
    ].filter(Boolean);
    const context = lines.join("\n");
    setAssistantMsg(
      `Aiutami ad analizzare e risolvere questi risultati dell'Health Check di BikerLink:\n\n${context}`,
    );
    setAssistantOpen(true);
  }, [report, grouped]);

  const exportJson = useCallback(async () => {
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    if (Platform.OS === "web") {
      try {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bikerlink-healthcheck-${report.runId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        Alert.alert("Esporta", (e as Error).message);
      }
      return;
    }
    setBusyAction("export");
    const ok = await copyLogToClipboard({ title: "Health Check JSON", extraLines: [json] });
    setBusyAction(null);
    Alert.alert("Esporta JSON", ok ? "JSON copiato negli appunti." : "Copia non riuscita.");
  }, [report]);

  const safeCount = useMemo(() => {
    let n = 0;
    for (const c of report?.checkers ?? []) for (const r of c.results) if (r.safeFix) n++;
    return n;
  }, [report]);

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4, paddingBottom: 30 }}>
      {/* Checker toggles */}
      <Text style={s.scanLabel}>Controlli</Text>
      <View style={s.scanChipWrap}>
        {checkers.map((c) => {
          const on = isChecked(c.id);
          return (
            <TouchableOpacity
              key={c.id}
              style={[s.scanChip, on && s.scanChipOn]}
              onPress={() => toggle(c.id)}
              disabled={running}
              activeOpacity={0.75}
            >
              <Text style={[s.scanChipText, on && s.scanChipTextOn]}>
                {on ? "✓ " : ""}{c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Provider AI selector */}
      <Text style={s.scanLabel}>Provider AI</Text>
      <View style={s.scanChipWrap}>
        <TouchableOpacity
          style={[s.scanChip, provider === null && s.scanChipOn]}
          onPress={() => { setProviderTouched(true); setProvider(null); }}
          disabled={running}
          activeOpacity={0.75}
        >
          <Text style={[s.scanChipText, provider === null && s.scanChipTextOn]}>Nessuno</Text>
        </TouchableOpacity>
        {PROVIDER_ORDER.map((id) => {
          const st = statusById.get(id);
          const on = provider === id;
          const usable = isProviderAvailable(id);
          return (
            <TouchableOpacity
              key={id}
              style={[s.scanProviderChip, on && s.scanChipOn, !usable && s.scanChipDisabled]}
              onPress={() => { setProviderTouched(true); setProvider(id); }}
              disabled={running || !usable}
              activeOpacity={0.75}
            >
              <View style={[s.scanProviderDot, { backgroundColor: providerDot(st) }]} />
              <Text style={[s.scanChipText, on && s.scanChipTextOn, !usable && s.scanChipTextDisabled]}>
                {st?.label ?? id}{!usable ? " (offline)" : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Modalità */}
      <Text style={s.scanLabel}>Modalità</Text>
      <View style={s.scanChipWrap}>
        {(["analysis", "fix"] as const).map((m) => {
          const on = mode === m;
          return (
            <TouchableOpacity
              key={m}
              style={[s.scanChip, on && s.scanChipOn]}
              onPress={() => setMode(m)}
              disabled={running}
              activeOpacity={0.75}
            >
              <Text style={[s.scanChipText, on && s.scanChipTextOn]}>
                {m === "analysis" ? "Solo analisi" : "Analisi + Fix"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Avvia scan */}
      <TouchableOpacity
        style={[s.scanRunBtn, (running || selectedIds.length === 0) && s.scanRunBtnDisabled]}
        onPress={runScan}
        disabled={running || selectedIds.length === 0}
        activeOpacity={0.85}
      >
        {running ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name="play" size={18} color="#fff" />
        )}
        <Text style={s.scanRunBtnText}>{running ? "Scan in corso…" : "Avvia Scan"}</Text>
      </TouchableOpacity>

      {/* Progresso per-checker */}
      {(running || Object.keys(progress).length > 0) && (
        <View style={s.scanProgressRow}>
          {checkers.filter((c) => progress[c.id]).map((c) => {
            const st = progress[c.id];
            const color = st === "ok" ? "#22c55e" : st === "error" ? "#ef4444" : st === "skipped" ? Colors.textSecondary : "#f59e0b";
            return (
              <View key={c.id} style={s.scanProgressItem}>
                {st === "pending" ? (
                  <ActivityIndicator size="small" color="#f59e0b" />
                ) : (
                  <View style={[s.scanProviderDot, { backgroundColor: color }]} />
                )}
                <Text style={s.scanProgressText}>{c.label}</Text>
              </View>
            );
          })}
          {aiRunning && (
            <View style={s.scanProgressItem}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={s.scanProgressText}>Analisi AI…</Text>
            </View>
          )}
        </View>
      )}

      {/* Risultati */}
      {report && (
        <>
          <View style={s.scanSummaryRow}>
            {SEVERITY_ORDER.map((sev) => (
              <View key={sev} style={s.scanSummaryPill}>
                <Text style={[s.scanSummaryNum, { color: SEVERITY_COLOR[sev] }]}>
                  {report.summary[sev]}
                </Text>
                <Text style={s.scanSummaryLbl}>{SEVERITY_LABEL[sev]}</Text>
              </View>
            ))}
          </View>

          {/* Analisi AI (accordion) */}
          {(report.aiAnalysis || report.aiAnalysisStatus === "error") && (
            <View style={s.scanAiBox}>
              <TouchableOpacity
                style={s.scanDiffToggle}
                onPress={() => setShowAi((v) => !v)}
                activeOpacity={0.75}
              >
                <Ionicons name={showAi ? "chevron-up" : "chevron-down"} size={14} color={Colors.accent} />
                <Text style={s.scanDiffToggleText}>
                  Analisi AI{report.aiAnalysisProvider ? ` (${report.aiAnalysisProvider})` : ""}
                </Text>
              </TouchableOpacity>
              {showAi && (
                report.aiAnalysisStatus === "error" ? (
                  <Text style={[s.scanAiBody, { color: "#ef4444" }]}>
                    {report.aiAnalysisError ?? "Errore analisi AI"}
                  </Text>
                ) : (
                  <Text style={s.scanAiBody}>{report.aiAnalysis}</Text>
                )
              )}
            </View>
          )}

          {SEVERITY_ORDER.map((sev) =>
            grouped[sev].length > 0 ? (
              <View key={sev}>
                <Text style={[s.scanGroupHeader, { color: SEVERITY_COLOR[sev] }]}>
                  {SEVERITY_LABEL[sev]} ({grouped[sev].length})
                </Text>
                {grouped[sev].map((item, i) => (
                  <ResultCard key={`${item.checkId}-${i}`} item={item} fixMode={mode === "fix"} onCreateTask={createTask} />
                ))}
              </View>
            ) : null,
          )}

          {grouped.critical.length + grouped.warning.length + grouped.info.length === 0 && (
            <Text style={[s.scanResultDesc, { textAlign: "center", marginTop: 16, color: Colors.textSecondary }]}>
              ✅ Nessun problema rilevato dai controlli selezionati.
            </Text>
          )}

          {/* Action bar */}
          <View style={s.scanActionBar}>
            <TouchableOpacity
              style={s.scanActionBtn}
              onPress={createAllSafe}
              disabled={busyAction !== null || safeCount === 0}
              activeOpacity={0.75}
            >
              <Ionicons name="checkmark-done" size={14} color={Colors.text} />
              <Text style={s.scanActionBtnText}>Crea tutti i task sicuri ({safeCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.scanActionBtn} onPress={saveLog} disabled={busyAction !== null} activeOpacity={0.75}>
              <Text style={s.scanActionBtnText}>💾 Salva log</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.scanActionBtn} onPress={sendToAssistant} disabled={busyAction !== null} activeOpacity={0.75}>
              <Text style={s.scanActionBtnText}>🤖 Invia all'assistente</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.scanActionBtn} onPress={exportJson} disabled={busyAction !== null} activeOpacity={0.75}>
              <Text style={s.scanActionBtnText}>📤 Esporta JSON</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      </ScrollView>
      <AiCopilotDrawer
        visible={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        scope="free"
        initialMessage={assistantMsg}
      />
    </>
  );
}
