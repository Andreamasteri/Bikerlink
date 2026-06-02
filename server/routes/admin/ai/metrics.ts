/**
 * Admin AI Metrics — Task #3017
 *
 * GET /api/admin/ai/metrics
 * Ritorna metriche aggregate delle chiamate AI dalle ultime 24h/7gg:
 * - chiamate per provider, latenza mediana/p95, token totali, costo stimato
 * - tasso degraded, tasso repair, ultime 20 chiamate con errore/degraded
 */

import { Router, type Request, type Response } from "express";
import { db } from "../../../db";
import { aiCallLogs } from "@shared/db";
import { gte, desc, sql, and } from "drizzle-orm";

const router = Router();

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

router.get("/ai/metrics", async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Aggregati per provider (ultime 24h)
    const perProvider24h = await db
      .select({
        provider: aiCallLogs.provider,
        calls: sql<number>`count(*)::int`,
        tokensIn: sql<number>`sum(tokens_in)::int`,
        tokensOut: sql<number>`sum(tokens_out)::int`,
        costUsd: sql<number>`sum(cost_usd)::float`,
        degraded: sql<number>`sum(case when degraded then 1 else 0 end)::int`,
        repairs: sql<number>`sum(case when error = 'repaired' then 1 else 0 end)::int`,
      })
      .from(aiCallLogs)
      .where(gte(aiCallLogs.createdAt, since24h))
      .groupBy(aiCallLogs.provider)
      .orderBy(sql`count(*) desc`);

    // Aggregati per provider (ultimi 7gg)
    const perProvider7d = await db
      .select({
        provider: aiCallLogs.provider,
        calls: sql<number>`count(*)::int`,
        tokensIn: sql<number>`sum(tokens_in)::int`,
        tokensOut: sql<number>`sum(tokens_out)::int`,
        costUsd: sql<number>`sum(cost_usd)::float`,
        degraded: sql<number>`sum(case when degraded then 1 else 0 end)::int`,
        repairs: sql<number>`sum(case when error = 'repaired' then 1 else 0 end)::int`,
      })
      .from(aiCallLogs)
      .where(gte(aiCallLogs.createdAt, since7d))
      .groupBy(aiCallLogs.provider)
      .orderBy(sql`count(*) desc`);

    // Latenze per calcolo mediana/p95 (ultime 24h, max 1000 righe)
    const latencies = await db
      .select({ latencyMs: aiCallLogs.latencyMs })
      .from(aiCallLogs)
      .where(and(
        gte(aiCallLogs.createdAt, since24h),
        sql`latency_ms is not null`,
      ))
      .limit(1000);

    const sorted = latencies
      .map((r) => r.latencyMs ?? 0)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);

    const latencyP50 = percentile(sorted, 50);
    const latencyP95 = percentile(sorted, 95);

    // Ultime 20 chiamate con errore o degraded
    const recentIssues = await db
      .select({
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
      .where(sql`(degraded = true or error is not null)`)
      .orderBy(desc(aiCallLogs.createdAt))
      .limit(20);

    // Totali 24h per summary
    const [totals24h] = await db
      .select({
        calls: sql<number>`count(*)::int`,
        tokensIn: sql<number>`sum(tokens_in)::int`,
        tokensOut: sql<number>`sum(tokens_out)::int`,
        costUsd: sql<number>`sum(cost_usd)::float`,
        degradedCount: sql<number>`sum(case when degraded then 1 else 0 end)::int`,
        repairedCount: sql<number>`sum(case when error = 'repaired' then 1 else 0 end)::int`,
      })
      .from(aiCallLogs)
      .where(gte(aiCallLogs.createdAt, since24h));

    return res.json({
      summary24h: {
        calls: totals24h?.calls ?? 0,
        tokensIn: totals24h?.tokensIn ?? 0,
        tokensOut: totals24h?.tokensOut ?? 0,
        costUsd: Number((totals24h?.costUsd ?? 0).toFixed(6)),
        degradedRate: totals24h?.calls
          ? Number((((totals24h?.degradedCount ?? 0) / totals24h.calls) * 100).toFixed(1))
          : 0,
        repairRate: totals24h?.calls
          ? Number((((totals24h?.repairedCount ?? 0) / totals24h.calls) * 100).toFixed(1))
          : 0,
        latencyP50Ms: latencyP50,
        latencyP95Ms: latencyP95,
      },
      perProvider24h: perProvider24h.map((r) => ({
        provider: r.provider,
        calls: r.calls,
        tokensIn: r.tokensIn ?? 0,
        tokensOut: r.tokensOut ?? 0,
        costUsd: Number((r.costUsd ?? 0).toFixed(6)),
        degradedCount: r.degraded ?? 0,
        repairCount: r.repairs ?? 0,
      })),
      perProvider7d: perProvider7d.map((r) => ({
        provider: r.provider,
        calls: r.calls,
        tokensIn: r.tokensIn ?? 0,
        tokensOut: r.tokensOut ?? 0,
        costUsd: Number((r.costUsd ?? 0).toFixed(6)),
        degradedCount: r.degraded ?? 0,
        repairCount: r.repairs ?? 0,
      })),
      recentIssues: recentIssues.map((r) => ({
        id: r.id,
        provider: r.provider,
        modelId: r.modelId,
        latencyMs: r.latencyMs,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        costUsd: Number((r.costUsd ?? 0).toFixed(6)),
        degraded: r.degraded,
        error: r.error,
        createdAt: r.createdAt?.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[admin/ai/metrics]", err);
    return res.status(500).json({ error: "Errore metriche AI" });
  }
});

export default router;
