// Task #2532 — wrapper per scrivere su ai_suggestions_log + aggiornare budget.
import { db } from "../../db";
import { aiSuggestionsLog } from "@shared/db";
import { addCost } from "./budget";
import type { AiCallMeta } from "./types";

export interface LogEntry {
  scope: "triage" | "chat" | "digest" | "anomaly" | "action_draft";
  reportId?: string | null;
  userId?: string | null;
  prompt?: string | null;
  response?: string | null;
  suggestion?: unknown;
  meta: AiCallMeta;
}

export async function logAiCall(entry: LogEntry): Promise<string | null> {
  try {
    const [row] = await db.insert(aiSuggestionsLog).values({
      scope: entry.scope,
      reportId: entry.reportId ?? null,
      userId: entry.userId ?? null,
      prompt: entry.prompt ? entry.prompt.slice(0, 8000) : null,
      response: entry.response ? entry.response.slice(0, 16000) : null,
      suggestion: (entry.suggestion ?? null) as object | null,
      model: entry.meta.model,
      provider: entry.meta.provider,
      tokensIn: entry.meta.tokensIn,
      tokensOut: entry.meta.tokensOut,
      costUsd: String(entry.meta.costUsd),
    }).returning({ id: aiSuggestionsLog.id });
    addCost(entry.meta.costUsd).catch(() => {});
    return row?.id ?? null;
  } catch (err) {
    console.warn("[ai-log] insert error (non-fatal):", err);
    return null;
  }
}
