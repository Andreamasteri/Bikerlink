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
import { applyJobDirective } from "./job-gate";

export interface EscalationFinding {
  scope: string;
  summary: string;
  details?: unknown;
  /**
   * Nome del job (job-registry.ts) a cui questo finding è collegato. Se
   * presente e il finding è severo e ripetuto, `escalateFinding` può tradurlo
   * in una pausa autonoma (issuedBy="horus") — vedi `maybeAutoPause` sotto.
   * Se assente, l'escalation resta puramente informativa (comportamento
   * invariato rispetto a prima).
   */
  affectedJob?: string;
}

const ESCALATION_TIMEOUT_MS = 20_000;
const ESCALATION_NUM_PREDICT = 320;

// ── Auto-pausa Horus per finding severi e ripetuti ──────────────────────────
//
// Horus non deve aspettare un admin per fermare un job che sta chiaramente
// deragliando: se lo stesso scope viene segnalato come "error" almeno
// AUTO_PAUSE_REPEAT_THRESHOLD volte entro AUTO_PAUSE_WINDOW_MS, la direttiva
// di pausa viene emessa in autonomia (issuedBy="horus"). Il gate (job-gate.ts)
// la rispetta SOLO se il backing service di Horus è raggiungibile in quel
// momento: se Horus è offline, la pausa "congelata" non può bloccare il job
// per sempre — fallback deterministico, stesso contratto di Quebracho.
const AUTO_PAUSE_REPEAT_THRESHOLD = 3;
const AUTO_PAUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface RepeatState {
  count: number;
  lastAt: number;
}
const _repeatCounters = new Map<string, RepeatState>();

/**
 * Incrementa il contatore di ripetizioni SOLO per i finding severi (status
 * "error") dello stesso scope. I finding "warn" non contribuiscono mai alla
 * soglia di auto-pausa — altrimenti una serie di warning innocui seguita da
 * un singolo errore isolato potrebbe far scattare una pausa non giustificata.
 */
function bumpSevereRepeatCount(scope: string): number {
  const now = Date.now();
  const prev = _repeatCounters.get(scope);
  const count = prev && now - prev.lastAt < AUTO_PAUSE_WINDOW_MS ? prev.count + 1 : 1;
  _repeatCounters.set(scope, { count, lastAt: now });
  return count;
}

async function maybeAutoPause(
  finding: EscalationFinding,
  repeatCount: number,
  assessment: string | null,
): Promise<void> {
  if (!finding.affectedJob) return;
  try {
    const reasonParts = [
      `Horus: pausa automatica dopo ${repeatCount} rilevazioni ripetute di "${finding.scope}"`,
      finding.summary,
    ];
    if (assessment) reasonParts.push(`Valutazione Horus: ${assessment}`);
    const reason = reasonParts.join(" — ").slice(0, 500);
    await applyJobDirective(finding.affectedJob, "pause", { reason }, "horus");
    await writeWatchdogLog({
      kind: "alert",
      scope: `${finding.scope}_autopause`,
      status: "warn",
      summary: `[Horus] Job "${finding.affectedJob}" messo in pausa automaticamente dopo ${repeatCount} rilevazioni ripetute (senza attendere un admin).`,
      details: { affectedJob: finding.affectedJob, repeatCount, originalScope: finding.scope },
    });
  } catch (err) {
    dedupWarn("escalation/horus-autopause", `Horus: auto-pausa fallita per job "${finding.affectedJob}" (non-fatal)`, err);
  }
}

/** Solo per i test: azzera i contatori di ripetizione. */
export function __resetEscalationRepeatCountersForTests(): void {
  _repeatCounters.clear();
}

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
  const status = extra.status ?? "warn";
  const originalId = await writeWatchdogLog({
    kind: "alert",
    scope: finding.scope,
    status,
    summary: finding.summary,
    details: finding.details,
  });

  // Il conteggio delle ripetizioni è deterministico (non dipende dalla
  // disponibilità di Horus): un finding severo e ripetuto deve poter mettere
  // in pausa il job anche se la valutazione testuale di Horus fallisce sotto.
  // Solo i finding "error" incrementano il contatore — un warning non conta
  // mai come "ripetizione severa", nemmeno se segue altri warning sullo
  // stesso scope.
  const severe = status === "error";
  const repeatCount = severe ? bumpSevereRepeatCount(finding.scope) : 0;

  const assessment = await askHorusForAssessment(finding);
  if (assessment) {
    await writeWatchdogLog({
      kind: "alert",
      scope: `${finding.scope}_escalation`,
      status: "warn",
      summary: `[Horus] ${assessment}`,
      details: { originalWatchdogLogId: originalId, originalScope: finding.scope, originalSummary: finding.summary },
    });
  }

  if (severe && repeatCount >= AUTO_PAUSE_REPEAT_THRESHOLD) {
    await maybeAutoPause(finding, repeatCount, assessment);
  }

  return originalId;
}
