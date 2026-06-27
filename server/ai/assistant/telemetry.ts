// Task #2698 — Telemetria AI Assistant (insert + cleanup retention 30d).
import { db } from "../../db";
import { aiAssistantTelemetry } from "@shared/db";
import { lt, sql, desc } from "drizzle-orm";

export type AssistantEventType =
  | "conversation_started"
  | "message_sent"
  | "action_proposed"
  | "action_executed"
  | "action_rejected"
  | "tip_shown"
  | "tip_dismissed"
  | "tip_disabled_permanent"
  | "onboarding_started"
  | "onboarding_completed"
  | "opt_out_changed";

export async function logAssistantEvent(opts: {
  eventType: AssistantEventType;
  platform: string;
  userRole?: string | null;
  userId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(aiAssistantTelemetry).values({
      eventType: opts.eventType,
      platform: opts.platform,
      userRole: opts.userRole ?? null,
      userId: opts.userId ?? null,
      payload: opts.payload ?? {},
    });
  } catch (e) {
    console.warn("[ai-assistant/telemetry] insert failed:", (e as Error).message);
  }
}

/**
 * Pulizia retention 30 giorni — chiamata dallo scheduler esistente.
 * Idempotente, sicura da eseguire in concorrenza.
 */
export async function cleanupAssistantTelemetry(retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600_000);
  const res = await db.delete(aiAssistantTelemetry)
    .where(lt(aiAssistantTelemetry.createdAt, cutoff))
    .returning({ id: aiAssistantTelemetry.id });
  return res.length;
}

export interface AdminActionHistoryRow {
  id: string;
  eventType: string;
  userId: string | null;
  actionId: string | null;
  params: Record<string, unknown> | null;
  ok: boolean | null;
  summary: string | null;
  createdAt: string;
}

export async function getAdminActionHistory(limit = 50): Promise<AdminActionHistoryRow[]> {
  const ACTION_EVENTS: string[] = ["action_proposed", "action_executed", "action_rejected"];
  const rows = await db
    .select()
    .from(aiAssistantTelemetry)
    .where(
      sql`platform = 'admin' AND event_type = ANY(${ACTION_EVENTS})`
    )
    .orderBy(desc(aiAssistantTelemetry.createdAt))
    .limit(limit);
  return rows.map((r) => {
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      eventType: r.eventType,
      userId: r.userId ?? null,
      actionId: typeof payload.actionId === "string" ? payload.actionId : null,
      params: typeof payload.params === "object" && payload.params !== null
        ? (payload.params as Record<string, unknown>)
        : null,
      ok: typeof payload.ok === "boolean" ? payload.ok : null,
      summary: typeof payload.summary === "string" ? payload.summary : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function getTelemetrySummary(opts: {
  platform: string;
  windowHours?: number;
}): Promise<{
  windowHours: number;
  byEvent: Record<string, number>;
  byRole: Record<string, Record<string, number>>;
}> {
  const windowHours = opts.windowHours ?? 24;
  const since = new Date(Date.now() - windowHours * 3600_000);
  const rows = await db.execute(sql`
    SELECT event_type, user_role, COUNT(*)::int AS c
    FROM ai_assistant_telemetry
    WHERE platform = ${opts.platform} AND created_at >= ${since}
    GROUP BY event_type, user_role
  `);
  const byEvent: Record<string, number> = {};
  const byRole: Record<string, Record<string, number>> = {};
  for (const r of (rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? rows as unknown as Array<Record<string, unknown>>) {
    const ev = String(r.event_type ?? "?");
    const role = String(r.user_role ?? "unknown");
    const c = Number(r.c ?? 0);
    byEvent[ev] = (byEvent[ev] ?? 0) + c;
    byRole[role] = byRole[role] ?? {};
    byRole[role][ev] = (byRole[role][ev] ?? 0) + c;
  }
  return { windowHours, byEvent, byRole };
}
