// Task #2532 — Digest giornaliero AI per moderatori. Ogni mattina (08:00
// Europe/Rome) raccoglie i dati 24h e usa il provider AI (con fallback +
// budget + log) per generare un brief narrativo in italiano per ogni mod.
// Persiste su moderator_digests e manda push con preview.
import { Cron } from "croner";
import { generateText } from "ai";
import { db, withDbRetry } from "../../db";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { reports, users, moderatorDigests, anomalyEvents } from "@shared/db";
import { and, eq, gte, desc, or, inArray, sql } from "drizzle-orm";
import { sendDigestPush } from "./push";
import { runWithFallback, estimateCostUsd } from "./provider";
import { withBudget } from "./budget";
import { logAiCall } from "./log";
import { redactPII } from "./redact";
import type { AiCallMeta } from "./types";
import { logAiUsage } from "../audit";

interface CaseSummary {
  id: string;
  severity: string;
  category: string | null;
  reportedUserId: string;
  createdAt: string;
  assigned: boolean;
  aiSummary?: string | null;
}

interface DigestPayload {
  generatedAt: string;
  totalReports24h: number;
  pendingTotal: number;
  topCases: CaseSummary[];
  anomalies24h: number;
  aiBrief: string; // narrativa generata dall'AI
  aiMeta?: { provider: string; model: string; fallback?: boolean };
}

async function gatherForModerator(modId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Burst di 4 query concorrenti per moderatore: ogni query prende uno slot dal
  // budget connessioni dei job in background, così il fan-out resta limitato dal
  // budget globale (max 3) e non può saturare il pool insieme agli altri job.
  const [pending, claimed, recent, anomalies] = await Promise.all([
    withBgDbSlot(() => withDbRetry(() => db.select({ id: reports.id }).from(reports).where(eq(reports.status, "pending")))),
    withBgDbSlot(() => withDbRetry(() => db.select().from(reports).where(and(
      eq(reports.assignedModeratorId, modId), eq(reports.status, "pending"),
    )).orderBy(desc(reports.severity), desc(reports.createdAt)).limit(5))),
    withBgDbSlot(() => withDbRetry(() => db.select({ id: reports.id }).from(reports).where(gte(reports.createdAt, since)))),
    withBgDbSlot(() => withDbRetry(() => db.select().from(anomalyEvents).where(gte(anomalyEvents.createdAt, since)))),
  ]);

  let topRows = claimed;
  if (topRows.length < 5) {
    const filled = await withBgDbSlot(() => withDbRetry(() => db.select().from(reports)
      .where(and(eq(reports.status, "pending"), or(
        eq(reports.severity, "critical"), eq(reports.severity, "high"),
      )))
      .orderBy(desc(reports.createdAt))
      .limit(5)));
    topRows = [...claimed, ...filled.filter((r) => !claimed.find((c) => c.id === r.id))].slice(0, 5);
  }

  const topCases: CaseSummary[] = topRows.map((r) => ({
    id: r.id, severity: r.severity, category: r.category,
    reportedUserId: r.reportedUserId,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    assigned: r.assignedModeratorId === modId,
    aiSummary: ((r.aiAnalysis as { summary?: string } | null)?.summary) ?? null,
  }));

  return { pending: pending.length, recent: recent.length, anomalies, topCases };
}

function buildDigestPrompt(modId: string, ctx: Awaited<ReturnType<typeof gatherForModerator>>): string {
  const lines: string[] = [
    `Sei l'assistente moderatore BikerLink. Genera un brief MATTUTINO (max 6 righe, italiano) per il moderatore ${modId.slice(0, 8)}.`,
    `Dati ultime 24h:`,
    `- Report totali nuovi: ${ctx.recent}`,
    `- Report pending complessivi: ${ctx.pending}`,
    `- Anomalie rilevate: ${ctx.anomalies.length}${ctx.anomalies.length ? ` (tipi: ${ctx.anomalies.map((a) => a.type).join(", ")})` : ""}`,
    `Top casi assegnati o urgenti:`,
    ...ctx.topCases.map((c, i) => `${i + 1}. [${c.severity}] cat=${c.category ?? "?"} ${c.assigned ? "(tuo)" : "(da claimare)"} — ${redactPII(c.aiSummary ?? "(no AI summary)").slice(0, 160)}`),
    `Stile: diretto, niente saluti, niente emoji, prioritizza con bullet. Suggerisci 1–2 azioni concrete.`,
  ];
  return lines.join("\n");
}

async function generateAiBrief(modId: string, ctx: Awaited<ReturnType<typeof gatherForModerator>>): Promise<{ brief: string; meta: AiCallMeta }> {
  const prompt = buildDigestPrompt(modId, ctx);
  const started = Date.now();
  const { value: result, model: m } = await runWithFallback({ role: "brain" }, (mm) =>
    mm.scheduler(() => generateText({ model: mm.model, prompt, temperature: 0.3 })),
  );
  const text = result.text.trim();
  const tokensIn = result.usage?.inputTokens ?? 0;
  const tokensOut = result.usage?.outputTokens ?? 0;
  const meta: AiCallMeta = {
    provider: m.providerName, model: m.modelId, tokensIn, tokensOut,
    costUsd: estimateCostUsd(m.modelId, tokensIn, tokensOut),
    durationMs: Date.now() - started,
  };
  await logAiCall({
    scope: "digest", userId: modId,
    prompt: prompt.slice(0, 4000), response: text.slice(0, 4000),
    suggestion: { brief: text }, meta,
  });
  await logAiUsage("digest", m.modelId, { tokensIn, tokensOut }, "scheduler");
  return { brief: text, meta };
}

async function generateForModerator(modId: string): Promise<DigestPayload> {
  const ctx = await gatherForModerator(modId);
  let aiBrief = "";
  let aiMeta: DigestPayload["aiMeta"];
  try {
    const out = await withBudget("digest", () => generateAiBrief(modId, ctx));
    aiBrief = out.brief;
    aiMeta = { provider: out.meta.provider, model: out.meta.model };
  } catch (err) {
    // Fallback deterministico se budget esaurito o tutti i provider down: il
    // moderatore riceve comunque il digest, solo senza la narrativa AI.
    const reason = (err as Error).message?.startsWith("AI_BUDGET_EXCEEDED") ? "budget_exhausted" : "provider_down";
    aiBrief = `[Brief AI non disponibile: ${reason}] ${ctx.recent} nuovi report nelle ultime 24h, ${ctx.pending} pending totali, ${ctx.anomalies.length} anomalie. ${ctx.topCases.length} casi prioritari da gestire.`;
    aiMeta = { provider: "rule-based", model: "deterministic", fallback: true };
  }
  return {
    generatedAt: new Date().toISOString(),
    totalReports24h: ctx.recent,
    pendingTotal: ctx.pending,
    topCases: ctx.topCases,
    anomalies24h: ctx.anomalies.length,
    aiBrief,
    aiMeta,
  };
}

export async function runDigestForAll(): Promise<{ moderators: number; skipped?: boolean }> {
  // Skip se non ci sono abbastanza dati rilevanti nelle ultime 24h.
  const MIN_REPORTS_THRESHOLD = 5;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recentCount] = await withBgDbSlot(() => withDbRetry(() => db.select({ cnt: sql<number>`count(*)::int` })
    .from(reports)
    .where(gte(reports.createdAt, since))));
  const recentTotal = Number(recentCount?.cnt ?? 0);
  if (recentTotal < MIN_REPORTS_THRESHOLD) {
    console.info(
      `[digest] skip — nessun dato rilevante (${recentTotal} report nelle ultime 24h, soglia=${MIN_REPORTS_THRESHOLD})`,
    );
    return { moderators: 0, skipped: true };
  }

  const mods = await withBgDbSlot(() => withDbRetry(() => db.select({ id: users.id, expoPushToken: users.expoPushToken })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(users.role, ["admin", "moderator"])))));
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const mod of mods) {
    try {
      const payload = await generateForModerator(mod.id);
      await db.insert(moderatorDigests).values({
        moderatorId: mod.id, date: today, payload: payload as object,
      }).onConflictDoNothing();
      if (mod.expoPushToken) {
        await sendDigestPush(mod.expoPushToken, payload.topCases.length);
      }
      count++;
    } catch (err) {
      console.warn("[ai-digest] moderator", mod.id, "error:", err);
    }
  }
  return { moderators: count };
}

export async function getLatestDigest(modId: string): Promise<DigestPayload | null> {
  const [row] = await db.select().from(moderatorDigests)
    .where(eq(moderatorDigests.moderatorId, modId))
    .orderBy(desc(moderatorDigests.createdAt)).limit(1);
  return row ? (row.payload as DigestPayload) : null;
}

// Task #2551 — variante che include id+read-flag per consentire mark-read
// e badge "non letto" sul pannello.
export async function getLatestDigestWithReadState(modId: string): Promise<{
  digestId: string;
  payload: DigestPayload;
  read: boolean;
} | null> {
  const [row] = await db.select().from(moderatorDigests)
    .where(eq(moderatorDigests.moderatorId, modId))
    .orderBy(desc(moderatorDigests.createdAt)).limit(1);
  if (!row) return null;
  const { digestReadState } = await import("@shared/db/social");
  const { and: andOp } = await import("drizzle-orm");
  const [rd] = await db.select({ digestId: digestReadState.digestId }).from(digestReadState)
    .where(andOp(eq(digestReadState.moderatorId, modId), eq(digestReadState.digestId, row.id)))
    .limit(1);
  return { digestId: row.id, payload: row.payload as DigestPayload, read: !!rd };
}

// Task #2551 — segna come letto. Idempotente (upsert via onConflictDoNothing).
export async function markDigestRead(modId: string, digestId: string): Promise<boolean> {
  const { digestReadState } = await import("@shared/db/social");
  await db.insert(digestReadState).values({
    moderatorId: modId, digestId,
  }).onConflictDoNothing();
  return true;
}

// Task #2551 — flag rapido per badge "non letto" sull'hub: true se esiste
// un digest piu' recente del read-state piu' recente del moderatore.
export async function hasUnreadDigest(modId: string): Promise<boolean> {
  const [latest] = await db.select({ id: moderatorDigests.id }).from(moderatorDigests)
    .where(eq(moderatorDigests.moderatorId, modId))
    .orderBy(desc(moderatorDigests.createdAt)).limit(1);
  if (!latest) return false;
  const { digestReadState } = await import("@shared/db/social");
  const { and: andOp } = await import("drizzle-orm");
  const [rd] = await db.select({ digestId: digestReadState.digestId }).from(digestReadState)
    .where(andOp(eq(digestReadState.moderatorId, modId), eq(digestReadState.digestId, latest.id)))
    .limit(1);
  return !rd;
}

let cron: Cron | null = null;

export function startDigestScheduler(): void {
  if (cron) return;
  try {
    cron = new Cron("0 8 * * *", { timezone: "Europe/Rome" }, async () => {
      try {
        const out = await runDigestForAll();
        console.log(`[ai-digest] generato per ${out.moderators} moderatori`);
      } catch (err) {
        console.warn("[ai-digest] run error:", err);
      }
    });
    console.log("[ai-digest] scheduler attivo (08:00 Europe/Rome)");
  } catch (err) {
    console.warn("[ai-digest] scheduler init error:", err);
  }
}

export function stopDigestScheduler(): void {
  if (cron) { cron.stop(); cron = null; }
}

export { reports as _reportsRef };
