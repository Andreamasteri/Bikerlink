/**
 * AI Call Logger — Task #3017
 *
 * Helper fire-and-forget per loggare ogni chiamata AI in ai_call_logs.
 * NON blocca lo stream: inserisce il record in background senza await.
 * Usato da runAssistantAgent e callOllamaChat.
 */
import { db } from "../db";
import { aiCallLogs } from "@shared/db";

export interface LogAiCallOpts {
  userId?: string | null;
  provider: string;
  modelId: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs?: number | null;
  costUsd: number;
  degraded?: boolean;
  securityBlocked?: boolean;
  /** Task #5228 — persona AI ("bowie" | "horus" | "ares"). */
  persona?: string | null;
  /** Task #5228 — client di origine ("main_app" | "bowie_terminal"). */
  sourceApp?: string | null;
  /** Task #5228 — esito consegna push per le righe notification-reply ("delivered" | "failed"). */
  notificationStatus?: string | null;
  /** Task #51 — superficie della chiamata ("direct" chat 1:1 | "group" tavola rotonda). */
  surface?: string | null;
  /** Task #51 — id della conversazione di gruppo quando surface="group". */
  groupConversationId?: string | null;
  error?: string | null;
}

/**
 * Inserisce un log della chiamata AI in modo fire-and-forget.
 * Non lancia mai eccezioni — gli errori di inserimento vengono solo loggati in console.
 */
export function logAiCall(opts: LogAiCallOpts): void {
  db.insert(aiCallLogs).values({
    userId: opts.userId ?? null,
    provider: opts.provider,
    modelId: opts.modelId,
    tokensIn: opts.tokensIn,
    tokensOut: opts.tokensOut,
    latencyMs: opts.latencyMs ?? null,
    costUsd: opts.costUsd,
    degraded: opts.degraded ?? false,
    securityBlocked: opts.securityBlocked ?? false,
    persona: opts.persona ?? null,
    sourceApp: opts.sourceApp ?? null,
    notificationStatus: opts.notificationStatus ?? null,
    surface: opts.surface ?? null,
    groupConversationId: opts.groupConversationId ?? null,
    error: opts.error ?? null,
  }).catch((err) => {
    console.warn("[ai-logger] inserimento fallito (ignorato):", (err as Error).message);
  });
}
