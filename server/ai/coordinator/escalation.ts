// Task #10 (Quebracho c) — canale di escalation Quebracho→Horus→report.
//
// I 3 guard job di Task #9 (guards.ts) rilevano SOLO e loggano su
// ai_watchdog_log. Questo modulo aggiunge un passo di escalation: dopo aver
// loggato il finding originale (invariato), chiede a Horus una valutazione
// sintetica (severità reale + azione consigliata) e — se risponde — persiste
// il risultato come voce collegata, leggibile dall'agente/admin tramite la
// stessa history già esposta (system-health, ai-monitor).
//
// Horus è SEMPRE opzionale: se irraggiungibile la chiamata fallisce in
// silenzio (nessun retry, nessun fallback al cloud — Horus/Bowie/Ares/Quebracho
// non ricadono mai sui provider cloud per questo tipo di analisi interna) e il
// finding resta comunque visibile con la sola diagnosi del guard.
import { callOllamaChat } from "../../lib/ollama-client";
import { writeWatchdogLog } from "../watchdog/log";
import { dedupWarn } from "../../lib/dedup-logger";

export interface EscalationFinding {
  scope: string;
  summary: string;
  details?: unknown;
}

const ESCALATION_TIMEOUT_MS = 20_000;
const ESCALATION_NUM_PREDICT = 320;

/**
 * Chiede a Horus una valutazione breve (max ~3 frasi) di un finding. Ritorna
 * null se Horus non è configurato/raggiungibile o la chiamata fallisce — MAI
 * lancia: il chiamante non deve gestire un path d'errore aggiuntivo.
 */
export async function askHorusForAssessment(finding: EscalationFinding): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ESCALATION_TIMEOUT_MS);
    const prompt =
      `Un guard automatico di BikerLink ha rilevato questo problema:\n` +
      `Scope: ${finding.scope}\n` +
      `Dettaglio: ${finding.summary}\n\n` +
      `In massimo 3 frasi, valuta la severità reale e l'azione consigliata per l'admin. ` +
      `Rispondi in italiano, senza preamboli né markdown.`;
    let text: string;
    try {
      text = await callOllamaChat(prompt, undefined, {
        persona: "horus",
        abortSignal: controller.signal,
        numPredict: ESCALATION_NUM_PREDICT,
      });
    } finally {
      clearTimeout(timer);
    }
    const trimmed = String(text ?? "").trim();
    return trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
  } catch (err) {
    dedupWarn("escalation/horus", "Horus non disponibile per la valutazione del guard (non-fatal)", err);
    return null;
  }
}

/**
 * Punto d'ingresso usato dai guard di coordinator/guards.ts. Logga SEMPRE il
 * finding originale (comportamento invariato rispetto a Task #9), poi tenta
 * l'escalation a Horus e — se risponde — persiste una seconda voce collegata.
 * Ritorna l'id della voce originale (utile nei test), o null se il logging
 * stesso fallisce.
 */
export async function escalateFinding(
  finding: EscalationFinding,
  extra: { status?: "warn" | "error" } = {},
): Promise<string | null> {
  const originalId = await writeWatchdogLog({
    kind: "alert",
    scope: finding.scope,
    status: extra.status ?? "warn",
    summary: finding.summary,
    details: finding.details,
  });

  const assessment = await askHorusForAssessment(finding);
  if (!assessment) return originalId;

  await writeWatchdogLog({
    kind: "alert",
    scope: `${finding.scope}_escalation`,
    status: "warn",
    summary: `[Horus] ${assessment}`,
    details: { originalWatchdogLogId: originalId, originalScope: finding.scope, originalSummary: finding.summary },
  });

  return originalId;
}
