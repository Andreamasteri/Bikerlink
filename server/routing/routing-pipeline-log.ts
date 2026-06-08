/**
 * Task #3557 — Ring buffer in-memory del coordinamento engine di routing.
 *
 * Registra l'esito di ogni richiesta servita da getActiveRouter: quale area GH
 * ha gestito la richiesta (risolta dalle coordinate di partenza), quale engine
 * era stato selezionato, quale è stato effettivamente usato (può differire in
 * caso di fallback o decisione AI), il motivo dell'eventuale fallback/errore,
 * la latenza e l'esito finale.
 *
 * Coerente con routing-metrics e ai-decision-log: nessuna tabella DB, è
 * diagnostica VOLATILE mostrata nel pannello admin e si azzera al riavvio.
 */
import type { RoutingAreaCode } from "@shared/routing-areas";

export type PipelineOutcome = "ok" | "fallback" | "error";

export interface PipelineEvent {
  ts: number;
  /** Area GH risolta dalle coordinate di partenza (bbox), null se fuori copertura. */
  areaCode: RoutingAreaCode | null;
  /** Engine selezionato dal selettore prima dell'esecuzione (es. "ai", "valhalla"). */
  engineSelected: string;
  /** Engine effettivamente usato per servire la richiesta. */
  engineUsed: string;
  /** Motivo del passaggio a un engine diverso / errore, se presente. */
  fallbackReason: string | null;
  /** Latenza totale della richiesta di routing (ms). */
  latencyMs: number;
  /** Esito del geocoding a monte (a questo livello le coordinate sono già risolte). */
  geocodingOk: boolean;
  /** Esito finale della richiesta. */
  outcome: PipelineOutcome;
  /** Messaggio d'errore sanitizzato, solo per outcome === "error". */
  error: string | null;
}

const MAX = 200;
const events: PipelineEvent[] = [];

export function recordPipelineEvent(ev: PipelineEvent): void {
  events.push(ev);
  if (events.length > MAX) events.shift();
}

/** Eventi più recenti per primi (max MAX). */
export function getPipelineEvents(limit = 50): PipelineEvent[] {
  const n = Math.max(1, Math.min(Math.trunc(limit) || 50, MAX));
  return events.slice(-n).reverse();
}

export interface PipelineSummary {
  windowMs: number;
  total: number;
  ok: number;
  fallback: number;
  error: number;
  /** Tasso di fallback (fallback / total), 0 se nessun evento. */
  fallbackRate: number;
  /** Conteggi per engine effettivamente usato nella finestra. */
  byEngineUsed: Record<string, { ok: number; fallback: number; error: number }>;
}

/** Contatori aggregati sugli eventi nella finestra (default ultimi 5 min). */
export function getPipelineSummary(windowMs: number = 5 * 60_000): PipelineSummary {
  const since = Date.now() - windowMs;
  const byEngineUsed: PipelineSummary["byEngineUsed"] = {};
  let total = 0, ok = 0, fallback = 0, error = 0;
  for (const e of events) {
    if (e.ts < since) continue;
    total++;
    if (e.outcome === "ok") ok++;
    else if (e.outcome === "fallback") fallback++;
    else error++;
    const bucket = byEngineUsed[e.engineUsed] ?? (byEngineUsed[e.engineUsed] = { ok: 0, fallback: 0, error: 0 });
    bucket[e.outcome]++;
  }
  return {
    windowMs,
    total,
    ok,
    fallback,
    error,
    fallbackRate: total > 0 ? Math.round((fallback / total) * 1000) / 1000 : 0,
    byEngineUsed,
  };
}

export function _resetPipelineLogForTests(): void {
  events.length = 0;
}
