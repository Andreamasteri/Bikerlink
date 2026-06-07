/**
 * Task #3191 — Ring buffer in-memory delle decisioni dell'AI Routing Engine
 * Selector. Coerente con routing-metrics: nessuna tabella DB, è diagnostica
 * volatile mostrata nel pannello admin (reason + confidence per richiesta).
 */
export type AiDecisionMode = "ai-direct" | "ai-dual-compare" | "fallback-smart";

export interface AiDecisionEntry {
  ts: number;
  mode: AiDecisionMode;
  chosenEngine: string;
  confidence: number | null;
  reason: string;
  provider: string | null;
  decisionLatencyMs: number;
  dualScores?: Record<string, number> | null;
}

const MAX = 100;
const entries: AiDecisionEntry[] = [];

export function recordAiDecision(entry: AiDecisionEntry): void {
  entries.push(entry);
  if (entries.length > MAX) entries.shift();
}

/** Decisioni più recenti per prime (max MAX). */
export function getAiDecisions(limit = 50): AiDecisionEntry[] {
  const n = Math.max(1, Math.min(Math.trunc(limit) || 50, MAX));
  return entries.slice(-n).reverse();
}

export function _resetAiDecisionsForTests(): void {
  entries.length = 0;
}
