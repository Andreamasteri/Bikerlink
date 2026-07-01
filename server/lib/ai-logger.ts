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
    error: opts.error ?? null,
  }).catch((err) => {
    console.warn("[ai-logger] inserimento fallito (ignorato):", (err as Error).message);
  });
}
