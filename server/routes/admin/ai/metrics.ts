/**
 * Admin AI Metrics — Task #3017 / #3098
 *
 * GET /api/admin/ai/metrics?range=24h|7d|30d  (default 7d)
 * Ritorna metriche aggregate delle chiamate AI per il range selezionato:
 * - summary (calls, tokens, cost, degradedRate, latency p50/p95)
 * - chiamate per provider (calls, tokens, cost, errorRate)
 * - ultime 20 chiamate con errore/degraded
 */

import { Router, type Request, type Response } from "express";
import { db } from "../../../db";
import { aiCallLogs } from "@shared/db";
import { gte, desc, sql, and } from "drizzle-orm";
import { sendError } from "../../../lib/api-response";

const router = Router();

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function rangeMs(range: string): number {
  switch (range) {
    case "24h": return 24 * 60 * 60 * 1000;
    case "30d": return 30 * 24 * 60 * 60 * 1000;
    default:    return 7 * 24 * 60 * 60 * 1000;
  }
}

router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const rawRange = String(req.query.range ?? "7d");
    const range = ["24h", "7d", "30d"].includes(rawRange) ? rawRange : "7d";
    const since = new Date(Date.now() - rangeMs(range));

    const [perProvider, totalsRow, latencies, recentIssues] = await Promise.all([
      db.select({
          provider: aiCallLogs.provider,
          calls: sql<number>`count(*)::int`,
          tokensIn: sql<number>`coalesce(sum(tokens_in),0)::int`,
          tokensOut: sql<number>`coalesce(sum(tokens_out),0)::int`,
          costUsd: sql<number>`coalesce(sum(cost_usd),0)::float`,
          degradedCount: sql<number>`sum(case when degraded then 1 else 0 end)::int`,
          errorCount: sql<number>`sum(case when error is not null and error not in ('json_repaired','repaired') then 1 else 0 end)::int`,
          repairCount: sql<number>`sum(case when error in ('json_repaired','repaired') then 1 else 0 end)::int`,
        })
        .from(aiCallLogs)
        .where(gte(aiCallLogs.createdAt, since))
        .groupBy(aiCallLogs.provider)
        .orderBy(sql`count(*) desc`),

      db.select({
          calls: sql<number>`count(*)::int`,
          tokensIn: sql<number>`coalesce(sum(tokens_in),0)::int`,
          tokensOut: sql<number>`coalesce(sum(tokens_out),0)::int`,
          costUsd: sql<number>`coalesce(sum(cost_usd),0)::float`,
          degradedCount: sql<number>`sum(case when degraded then 1 else 0 end)::int`,
          errorCount: sql<number>`sum(case when error is not null and error not in ('json_repaired','repaired') then 1 else 0 end)::int`,
          repairCount: sql<number>`sum(case when error in ('json_repaired','repaired') then 1 else 0 end)::int`,
        })
        .from(aiCallLogs)
        .where(gte(aiCallLogs.createdAt, since)),

      db.select({ latencyMs: aiCallLogs.latencyMs })
        .from(aiCallLogs)
        .where(and(
          gte(aiCallLogs.createdAt, since),
          sql`latency_ms is not null`,
        ))
        .limit(2000),

      db.select({
          id: aiCallLogs.id,
          provider: aiCallLogs.provider,
          modelId: aiCallLogs.modelId,
          latencyMs: aiCallLogs.latencyMs,
          tokensIn: aiCallLogs.tokensIn,
          tokensOut: aiCallLogs.tokensOut,
          costUsd: aiCallLogs.costUsd,
          degraded: aiCallLogs.degraded,
          error: aiCallLogs.error,
          createdAt: aiCallLogs.createdAt,
        })
        .from(aiCallLogs)
        .where(and(
          gte(aiCallLogs.createdAt, since),
          sql`(degraded = true or (error is not null and error not in ('json_repaired','repaired')))`,
        ))
        .orderBy(desc(aiCallLogs.createdAt))
        .limit(20),
    ]);

    const totals = totalsRow[0];
    const sorted = latencies
      .map((r) => r.latencyMs ?? 0)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);

    return res.json({
      range,
      summary: {
        calls: totals?.calls ?? 0,
        tokensIn: totals?.tokensIn ?? 0,
        tokensOut: totals?.tokensOut ?? 0,
        costUsd: Number((totals?.costUsd ?? 0).toFixed(6)),
        degradedRate: totals?.calls
          ? Number((((totals.degradedCount ?? 0) / totals.calls) * 100).toFixed(1))
          : 0,
        errorRate: totals?.calls
          ? Number((((totals.errorCount ?? 0) / totals.calls) * 100).toFixed(1))
          : 0,
        repairCount: totals?.repairCount ?? 0,
        repairRate: totals?.calls
          ? Number((((totals.repairCount ?? 0) / totals.calls) * 100).toFixed(2))
          : 0,
        latencyP50Ms: percentile(sorted, 50),
        latencyP95Ms: percentile(sorted, 95),
      },
      perProvider: perProvider.map((r) => ({
        provider: r.provider,
        calls: r.calls,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        costUsd: Number((r.costUsd ?? 0).toFixed(6)),
        degradedCount: r.degradedCount ?? 0,
        errorCount: r.errorCount ?? 0,
        errorRate: r.calls
          ? Number((((r.errorCount ?? 0) / r.calls) * 100).toFixed(1))
          : 0,
        repairCount: r.repairCount ?? 0,
        repairRate: r.calls
          ? Number((((r.repairCount ?? 0) / r.calls) * 100).toFixed(2))
          : 0,
      })),
      recentIssues: recentIssues.map((r) => ({
        id: r.id,
        provider: r.provider,
        modelId: r.modelId,
        latencyMs: r.latencyMs,
        costUsd: Number((r.costUsd ?? 0).toFixed(6)),
        degraded: r.degraded,
        error: r.error,
        createdAt: r.createdAt?.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[admin/ai/metrics]", err);
    return sendError(res, 500, "Errore metriche AI");
  }
});

export default router;
