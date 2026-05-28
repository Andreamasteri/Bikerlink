// Task #2654 — Adapter OTA Orchestrator → AI Coordinator (b).
// Pattern: thin wrapper. Tutte le chiamate al Coordinator sono in try/catch:
// se qualsiasi cosa fallisce, OTA continua con la logica originale.
import { getCoordinator } from "../index";
import type { Severity } from "../types";

const AI_NAME = "ota-orchestrator";
const WATCHDOG_WINDOW_MIN = 1; // ultimi 60s
const INTEGRITY_WINDOW_MIN = 5; // ultimi 5 minuti

export interface DelayDecision {
  delay: boolean;
  reason: string;
  conflictId?: string;
  policyRuleId?: string | null;
}

/**
 * Verifica se il Coordinator richiede di posticipare un publishOta.
 * Logica: cerca alert critici recenti di watchdog/app-integrity → se trovati,
 * scrive un evento OTA sintetico + evaluateConflict → se action BLOCK → delay.
 * Fallback graceful: in caso di errore restituisce {delay:false}.
 */
export async function shouldDelayForCoordinator(args: {
  action: "publish" | "approve";
  correlationId: string;
  payload?: Record<string, unknown>;
}): Promise<DelayDecision> {
  try {
    const c = getCoordinator();
    // 1) Watchdog critical recente — solo alert (no kill_switch/status_change)
    const wd = await c.query({
      aiName: "watchdog",
      eventType: "alert",
      severity: "critical",
      sinceHours: WATCHDOG_WINDOW_MIN / 60,
      limit: 1,
    });
    if (wd.rows.length > 0) {
      const decision = await emitAndResolveConflict({
        correlationId: args.correlationId,
        action: args.action,
        otherEventId: wd.rows[0].id,
        otherPayloadSummary: { signal: "watchdog_critical", source: wd.rows[0].eventType },
        conflictType: "ota_watchdog_alert",
        payload: args.payload ?? {},
      });
      if (decision.delay) return decision;
    }

    // 2) App-integrity critical recente — solo violation_detected
    const ai = await c.query({
      aiName: "app-integrity",
      eventType: "violation_detected",
      severity: "critical",
      sinceHours: INTEGRITY_WINDOW_MIN / 60,
      limit: 1,
    });
    if (ai.rows.length > 0) {
      const decision = await emitAndResolveConflict({
        correlationId: args.correlationId,
        action: args.action,
        otherEventId: ai.rows[0].id,
        otherPayloadSummary: { signal: "app_integrity_critical", source: ai.rows[0].eventType },
        conflictType: "ota_integrity_drift",
        payload: args.payload ?? {},
      });
      if (decision.delay) return decision;
    }
    return { delay: false, reason: "ok" };
  } catch (err) {
    console.warn(`[coordinator/ota] shouldDelay fallback (errore Coordinator):`, (err as Error).message);
    return { delay: false, reason: "coordinator-unavailable" };
  }
}

async function emitAndResolveConflict(opts: {
  correlationId: string;
  action: "publish" | "approve";
  otherEventId: string;
  otherPayloadSummary: Record<string, unknown>;
  conflictType: string;
  payload: Record<string, unknown>;
}): Promise<DelayDecision> {
  const c = getCoordinator();
  const { id: eventIdA } = await c.emit({
    aiName: AI_NAME,
    eventType: `${opts.action}_attempt`,
    payload: { action: opts.action, otherEvent: opts.otherPayloadSummary, ...opts.payload },
    severity: "warn",
    correlationId: opts.correlationId,
  });
  const conflict = await c.evaluateConflict({
    eventIdA,
    eventIdB: opts.otherEventId,
    conflictType: opts.conflictType,
  });
  if (conflict.action === "BLOCK" || conflict.action === "DELAY") {
    return {
      delay: true,
      reason: `${opts.conflictType}: ${conflict.rationale}`,
      conflictId: conflict.conflictId,
      policyRuleId: conflict.policyRuleId,
    };
  }
  return { delay: false, reason: `${opts.conflictType}: ${conflict.action}` };
}

export type OtaDecisionType =
  | "PUBLISH_OTA"
  | "DELAY"
  | "ROLLBACK"
  | "APPROVE_RELEASE"
  | "REJECT_RELEASE"
  | "SYNC_EAS"
  | "FORCE_UPDATE";

export async function recordOtaDecision(opts: {
  decisionType: OtaDecisionType;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  rationale?: string;
  tookMs?: number;
  correlationId?: string;
  severity?: Severity;
}): Promise<void> {
  try {
    const c = getCoordinator();
    await c.recordDecision({
      aiName: AI_NAME,
      decisionType: opts.decisionType,
      input: opts.input,
      output: opts.output,
      rationale: opts.rationale,
      tookMs: opts.tookMs ?? 0,
      correlationId: opts.correlationId,
    });
    // Heartbeat event per dashboard health
    await c.emit({
      aiName: AI_NAME,
      eventType: `decision_${opts.decisionType.toLowerCase()}`,
      payload: { input: opts.input, output: opts.output },
      severity: opts.severity ?? "info",
      correlationId: opts.correlationId,
    });
  } catch (err) {
    console.warn(`[coordinator/ota] recordDecision fallback:`, (err as Error).message);
  }
}

export function wireOtaToCoordinator(): void {
  console.log("[INIT] AI Coordinator wire ota-orchestrator");
}
