// Task #2532 — Triage engine. Riceve un report + contesto, ritorna un'analisi
// strutturata via generateObject (Zod schema garantito). PII redacted prima.
import { generateStructured, runWithFallback, estimateCostUsd } from "./provider";
import { db } from "../../db";
import { reports, users } from "@shared/db";
import { eq, and, ne, desc, gte } from "drizzle-orm";
import pRetry from "p-retry";
import { redactPII } from "./redact";
import { triageOutputSchema, type TriageOutput, type AiCallMeta } from "./types";
import { withBudget } from "./budget";
import { logAiCall } from "./log";
import { emitModerationSuggestion } from "../coordinator/integrations/moderation";

const SYSTEM_PROMPT = `Sei un moderatore AI esperto della community motociclistica BikerLink.
Analizza la segnalazione e restituisci SOLO l'oggetto JSON richiesto dallo schema.
REGOLE:
- Tutti i tuoi output sono SUGGERIMENTI: non eseguono ban autonomamente.
- Considera la trust score del reporter (1.0 = affidabile, <0.5 = sospetto).
- Se ci sono molte segnalazioni recenti dal segnalante verso utenti diversi → alza isRetaliatoryProbability.
- Se la descrizione è generica/copy-paste → alza isSpamProbability.
- summary in italiano, max 2 righe.
- reasoning in italiano, sintetico (max 4 righe).
- suggestedAction: usa "warn" per low/medium prima offesa, "shadow_ban" per pattern ripetuti, "ban_temp" per high con prove, "ban_perm" SOLO per critical reiterati o illeciti gravi, "dismiss" se sospetto retaliatorio/spam.
- confidence basato sulla qualità dei dati a disposizione.`;

export interface TriageInput {
  reportId: string;
}

interface ReportContext {
  report: typeof reports.$inferSelect;
  reportedUserHistory: Array<{ id: string; category: string | null; severity: string; createdAt: string; reason: string }>;
  reporterRecentReports: Array<{ id: string; category: string | null; reportedUserId: string; createdAt: string }>;
  reporterNickname: string | null;
  reportedNickname: string | null;
}

async function gatherContext(reportId: string): Promise<ReportContext | null> {
  const [r] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!r) return null;
  // Privacy opt-out: se l'utente segnalato ha disabilitato l'analisi AI per
  // questo report, non procediamo (doppio guard, oltre a quello in queue.ts).
  if (r.disableAiAnalysis) return null;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [history, reporterRecents, [reporterUser], [reportedUser]] = await Promise.all([
    db.select({
      id: reports.id, category: reports.category, severity: reports.severity,
      createdAt: reports.createdAt, reason: reports.reason,
    }).from(reports)
      .where(and(eq(reports.reportedUserId, r.reportedUserId), ne(reports.id, reportId)))
      .orderBy(desc(reports.createdAt)).limit(20),
    db.select({
      id: reports.id, category: reports.category, reportedUserId: reports.reportedUserId,
      createdAt: reports.createdAt,
    }).from(reports)
      .where(and(eq(reports.reporterId, r.reporterId), ne(reports.id, reportId), gte(reports.createdAt, since)))
      .orderBy(desc(reports.createdAt)).limit(20),
    db.select({ nickname: users.nickname }).from(users).where(eq(users.id, r.reporterId)),
    db.select({ nickname: users.nickname }).from(users).where(eq(users.id, r.reportedUserId)),
  ]);
  return {
    report: r,
    reportedUserHistory: history.map((h) => ({
      ...h, createdAt: h.createdAt instanceof Date ? h.createdAt.toISOString() : String(h.createdAt),
    })),
    reporterRecentReports: reporterRecents.map((h) => ({
      ...h, createdAt: h.createdAt instanceof Date ? h.createdAt.toISOString() : String(h.createdAt),
    })),
    reporterNickname: reporterUser?.nickname ?? null,
    reportedNickname: reportedUser?.nickname ?? null,
  };
}

function buildPrompt(ctx: ReportContext): string {
  const r = ctx.report;
  return [
    `Report ID: ${r.id}`,
    `Categoria scelta utente: ${r.category ?? "—"}  Severity: ${r.severity}`,
    `Contesto: ${r.context ?? "—"}  Hook feedback loop: ${r.affectedFeedbackLoop}`,
    `Reporter trust score: ${r.reporterTrustScore.toFixed(2)}`,
    `Motivo dichiarato: ${redactPII(r.reason).slice(0, 300)}`,
    `Descrizione: ${redactPII(r.description ?? "").slice(0, 1500)}`,
    "",
    `Storico utente segnalato (${ctx.reportedUserHistory.length} report):`,
    ctx.reportedUserHistory.slice(0, 10).map((h) =>
      `  - [${h.id.slice(0, 8)}] cat=${h.category ?? "?"} sev=${h.severity} at=${h.createdAt} reason="${redactPII(h.reason).slice(0, 80)}"`,
    ).join("\n") || "  (nessuno)",
    "",
    `Report recenti dello STESSO reporter verso altri (${ctx.reporterRecentReports.length}, ultimi 30 giorni):`,
    ctx.reporterRecentReports.slice(0, 10).map((h) =>
      `  - [${h.id.slice(0, 8)}] vs ${h.reportedUserId.slice(0, 8)} cat=${h.category ?? "?"} at=${h.createdAt}`,
    ).join("\n") || "  (nessuno)",
  ].join("\n");
}

// Fallback rule-based deterministico, usato quando il budget AI è esaurito.
// Niente LLM: solo euristiche su severity/trust/storico → output Schema-conforme.
function ruleBasedTriage(ctx: ReportContext): TriageOutput {
  const r = ctx.report;
  const historyCount = ctx.reportedUserHistory.length;
  const reporterRecentCount = ctx.reporterRecentReports.length;
  const trust = r.reporterTrustScore;

  // Spam = molti report dello stesso reporter in 30g.
  const isSpamProbability = Math.min(1, reporterRecentCount / 10);
  // Retaliatorio = trust basso + reporter molto attivo.
  const isRetaliatoryProbability = trust < 0.5 ? 0.6 : trust < 0.7 ? 0.3 : 0.1;

  const severitySuggested: TriageOutput["severitySuggested"] = (r.severity as TriageOutput["severitySuggested"]) ?? "low";
  let suggestedAction: TriageOutput["suggestedAction"] = "none";
  let suggestedBanDays = 0;

  if (isSpamProbability > 0.6 || isRetaliatoryProbability > 0.5) {
    suggestedAction = "dismiss";
  } else if (severitySuggested === "critical" && historyCount >= 3) {
    suggestedAction = "ban_perm";
  } else if (severitySuggested === "high" && historyCount >= 2) {
    suggestedAction = "ban_temp"; suggestedBanDays = 14;
  } else if (severitySuggested === "high" || historyCount >= 5) {
    suggestedAction = "shadow_ban";
  } else if (severitySuggested === "medium") {
    suggestedAction = "warn";
  }

  return {
    severitySuggested,
    categorySuggested: (r.category ?? "other") as TriageOutput["categorySuggested"],
    isSpamProbability,
    isRetaliatoryProbability,
    similarReports: [],
    summary: `Triage rule-based (AI budget esaurito). Storico utente: ${historyCount} report. Reporter: ${reporterRecentCount} report in 30g, trust ${trust.toFixed(2)}.`,
    suggestedAction,
    suggestedBanDays,
    reasoning: `Fallback deterministico. Severity=${severitySuggested}, historyCount=${historyCount}, isSpam=${isSpamProbability.toFixed(2)}, isRetal=${isRetaliatoryProbability.toFixed(2)}.`,
    confidence: 0.45,
  };
}

export async function runTriage(input: TriageInput): Promise<TriageOutput | null> {
  // Cattura una eventuale eccezione di budget per attivare il fallback rule-based.
  const ctxForFallback = await gatherContext(input.reportId);
  if (!ctxForFallback) return null;
  try {
    return await withBudget("triage", async () => {
    const ctx = ctxForFallback;
    const prompt = buildPrompt(ctx);
    const started = Date.now();
    try {
      const { value: result, model: m } = await runWithFallback({ role: "brain" }, (mm) =>
        pRetry(
          () => mm.scheduler(() => generateStructured(mm, {
            schema: triageOutputSchema,
            system: SYSTEM_PROMPT,
            prompt,
            temperature: 0.2,
          })),
          { retries: 2, minTimeout: 500, maxTimeout: 2000 },
        ),
      );
      const tokensIn = result.usage?.inputTokens ?? Math.ceil(prompt.length / 4);
      const tokensOut = result.usage?.outputTokens ?? 200;
      const meta: AiCallMeta = {
        provider: m.providerName, model: m.modelId,
        tokensIn, tokensOut,
        costUsd: estimateCostUsd(m.modelId, tokensIn, tokensOut),
        durationMs: Date.now() - started,
      };
      // Persist analysis on report + log.
      await db.update(reports).set({
        aiAnalysis: { ...result.object, _meta: { ...meta, generatedAt: new Date().toISOString() } } as object,
        aiAnalyzedAt: new Date(),
        aiModel: m.modelId,
      }).where(eq(reports.id, input.reportId));
      await logAiCall({
        scope: "triage", reportId: input.reportId,
        prompt: prompt.slice(0, 4000),
        response: JSON.stringify(result.object).slice(0, 4000),
        suggestion: result.object, meta,
      });
      // Task #2654 — emit al Coordinator (graceful)
      await emitModerationSuggestion({
        reportId: input.reportId,
        reportedUserId: ctx.report.reportedUserId,
        reporterId: ctx.report.reporterId,
        suggestion: result.object,
        modelId: m.modelId,
      });
      return result.object;
    } catch (err) {
      console.warn(`[ai-triage] tutti i provider falliti:`, (err as Error).message);
      return null;
    }
    });
  } catch (err) {
    if ((err as Error).message?.startsWith("AI_BUDGET_EXCEEDED")) {
      console.warn(`[ai-triage] budget esaurito, eseguo fallback rule-based per ${input.reportId}`);
      const rb = ruleBasedTriage(ctxForFallback);
      const meta: AiCallMeta = {
        provider: "rule-based", model: "deterministic", tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs: 0,
      };
      await db.update(reports).set({
        aiAnalysis: { ...rb, _meta: { ...meta, generatedAt: new Date().toISOString(), fallback: true } } as object,
        aiAnalyzedAt: new Date(),
        aiModel: "rule-based",
      }).where(eq(reports.id, input.reportId));
      await logAiCall({
        scope: "triage", reportId: input.reportId,
        prompt: "[rule-based fallback]", response: JSON.stringify(rb).slice(0, 4000),
        suggestion: rb, meta,
      });
      await emitModerationSuggestion({
        reportId: input.reportId,
        reportedUserId: ctxForFallback.report.reportedUserId,
        reporterId: ctxForFallback.report.reporterId,
        suggestion: rb,
        modelId: "rule-based",
      });
      return rb;
    }
    console.warn("[ai-triage] error:", err);
    return null;
  }
}
