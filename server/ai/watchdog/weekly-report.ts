// Task #2533 — Report settimanale (lunedì 07:00 Europe/Rome). Usa AI per
// generare un report strutturato basato sui signals e log della settimana.
import { Cron } from "croner";
import { generateObject } from "ai";
import { db } from "../../db";
import {
  systemHealthSnapshot, aiWatchdogLog, weeklySystemReports,
} from "@shared/db";
import { and, gte, lt, desc, eq } from "drizzle-orm";
import { runWithFallback, estimateCostUsd } from "../moderation/provider";
import { withBudget } from "../moderation/budget";
import { logAiCall } from "../moderation/log";
import { writeWatchdogLog } from "./log";
import { weeklyReportSchema } from "./types";
import { isWatchdogEnabled } from "./kill-switch";
import type { AiCallMeta } from "../moderation/types";
import { logAiUsage } from "../audit";

const SYSTEM = `Sei l'analista settimanale del watchdog BikerLink.
Genera un report strutturato in italiano basato su dati grezzi.
- highlights: max 8 punti chiave (cosa è andato bene/male)
- incidents: max 20 eventi importanti (warn/high/critical)
- recommendations: max 6 azioni prioritarie per la prossima settimana
- conclusion: 3-5 frasi`;

function getLastMondayUtc(): { from: Date; to: Date; weekStart: string } {
  const now = new Date();
  // Monday 00:00 UTC della settimana corrente (ISO). Per il job lunedì 07:00 Europe/Rome
  // generiamo il report della settimana PRECEDENTE.
  const day = now.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const thisMonday = new Date(now);
  thisMonday.setUTCHours(0, 0, 0, 0);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - daysSinceMonday);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  return { from: prevMonday, to: thisMonday, weekStart: prevMonday.toISOString().slice(0, 10) };
}

async function gather(from: Date, to: Date) {
  const [snaps, logs] = await Promise.all([
    db.select().from(systemHealthSnapshot).where(and(
      gte(systemHealthSnapshot.createdAt, from),
      lt(systemHealthSnapshot.createdAt, to),
    )).orderBy(desc(systemHealthSnapshot.createdAt)).limit(2000),
    db.select().from(aiWatchdogLog).where(and(
      gte(aiWatchdogLog.createdAt, from),
      lt(aiWatchdogLog.createdAt, to),
    )).orderBy(desc(aiWatchdogLog.createdAt)).limit(500),
  ]);
  let red = 0, orange = 0, yellow = 0, green = 0;
  let sumScore = 0;
  for (const s of snaps) {
    sumScore += s.score;
    if (s.status === "red") red++;
    else if (s.status === "orange") orange++;
    else if (s.status === "yellow") yellow++;
    else green++;
  }
  const autoFix = logs.filter((l) => l.kind === "auto_fix").length;
  const proposalsAccepted = logs.filter((l) => l.kind === "proposal" && l.status === "accepted").length;
  const proposalsRejected = logs.filter((l) => l.kind === "proposal" && l.status === "rejected").length;
  const alerts = logs.filter((l) => l.kind === "alert").length;
  const topIncidents = logs
    .filter((l) => l.kind === "alert" || (l.kind === "auto_fix" && l.status === "error"))
    .slice(0, 30);
  return {
    snaps: snaps.length,
    counts: { red, orange, yellow, green },
    avgScore: snaps.length ? Math.round(sumScore / snaps.length) : null,
    autoFix, proposalsAccepted, proposalsRejected, alerts, topIncidents,
  };
}

export async function runWeeklyReport(_now = new Date()): Promise<string | null> {
  if (!(await isWatchdogEnabled())) return null;
  const { from, to, weekStart } = getLastMondayUtc();
  // Idempotenza: se report esiste già per quella settimana, ritorna esistente.
  const [exists] = await db.select({ id: weeklySystemReports.id }).from(weeklySystemReports)
    .where(eq(weeklySystemReports.weekStart, weekStart));
  if (exists) return exists.id;

  const data = await gather(from, to);
  const prompt = [
    `Periodo: ${from.toISOString()} → ${to.toISOString()} (settimana ${weekStart})`,
    `Snapshots totali: ${data.snaps} | Score medio: ${data.avgScore ?? "n/d"}`,
    `Distribuzione status: red=${data.counts.red} orange=${data.counts.orange} yellow=${data.counts.yellow} green=${data.counts.green}`,
    `Auto-fix applicati: ${data.autoFix}`,
    `Proposte: accettate=${data.proposalsAccepted} rifiutate=${data.proposalsRejected}`,
    `Alert inviati: ${data.alerts}`,
    `Incidenti recenti (max 30):`,
    ...data.topIncidents.map((l, i) => `${i + 1}. [${l.kind}/${l.status}] ${l.scope ?? "?"} — ${(l.summary ?? "").slice(0, 200)}`),
  ].join("\n");

  try {
    return await withBudget("digest", async () => {
      const started = Date.now();
      const { value: result, model: m } = await runWithFallback({ role: "brain" }, (mm) =>
        mm.scheduler(() => generateObject({
          model: mm.model, schema: weeklyReportSchema, system: SYSTEM, prompt, temperature: 0.3,
        })),
      );
      const tokensIn = result.usage?.inputTokens ?? Math.ceil(prompt.length / 4);
      const tokensOut = result.usage?.outputTokens ?? 600;
      const meta: AiCallMeta = {
        provider: m.providerName, model: m.modelId, tokensIn, tokensOut,
        costUsd: estimateCostUsd(m.modelId, tokensIn, tokensOut),
        durationMs: Date.now() - started,
      };
      await logAiCall({
        scope: "digest", prompt: prompt.slice(0, 4000),
        response: JSON.stringify(result.object).slice(0, 4000),
        suggestion: result.object, meta,
      });
      await logAiUsage("weekly-report", m.modelId, { tokensIn, tokensOut }, "scheduler");
      const [row] = await db.insert(weeklySystemReports).values({
        weekStart, payload: result.object as object, modelUsed: m.modelId, costUsd: meta.costUsd,
      }).onConflictDoNothing().returning({ id: weeklySystemReports.id });
      await writeWatchdogLog({
        kind: "report", scope: weekStart, status: "ok",
        summary: `Report settimanale ${weekStart} generato`, details: { meta, data },
        costUsd: meta.costUsd,
      });
      return row?.id ?? null;
    });
  } catch (err) {
    console.warn("[watchdog/weekly] error:", err);
    await writeWatchdogLog({
      kind: "report", scope: weekStart, status: "error",
      summary: "Generazione report settimanale fallita",
      details: { error: (err as Error).message },
    });
    return null;
  }
}

let cron: Cron | null = null;
export function startWeeklyReportScheduler(): void {
  if (cron) return;
  try {
    cron = new Cron("0 7 * * 1", { timezone: "Europe/Rome" }, async () => {
      try {
        const id = await runWeeklyReport();
        console.log(`[watchdog/weekly] generato id=${id ?? "skip"}`);
      } catch (err) {
        console.warn("[watchdog/weekly] cron error:", err);
      }
    });
    console.log("[watchdog/weekly] scheduler attivo (lun 07:00 Europe/Rome)");
  } catch (err) {
    console.warn("[watchdog/weekly] scheduler init error:", err);
  }
}
export function stopWeeklyReportScheduler(): void { if (cron) { cron.stop(); cron = null; } }
