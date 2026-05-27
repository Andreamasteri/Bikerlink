import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "../../db";
import { abExperiments, abAssignments } from "@shared/db";
import { sendError } from "../../lib/api-response";
import { getExperimentStats, invalidateAbCache } from "../../matching/ab";
import * as ss from "simple-statistics";

const router = Router();

const variantSchema = z.object({
  name: z.string().min(1).max(60),
  weight: z.number().min(0),
  config: z.record(z.string(), z.unknown()).optional(),
});

const createSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/i, "Solo lettere/numeri/_"),
  description: z.string().max(1000).optional().nullable(),
  variants: z.array(variantSchema).min(2),
  status: z.enum(["running", "paused", "ended"]).default("running"),
});

const patchSchema = z.object({
  description: z.string().max(1000).optional().nullable(),
  variants: z.array(variantSchema).min(2).optional(),
  status: z.enum(["running", "paused", "ended"]).optional(),
});

router.get("/ab-experiments", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(abExperiments).orderBy(desc(abExperiments.createdAt));
    const withStats = await Promise.all(rows.map(async (exp) => {
      const stats = await getExperimentStats(exp.key);
      return { ...exp, stats: stats.length > 0 ? stats : exp.variants.map((v) => ({ variant: v.name, users: 0, events: {} })) };
    }));
    return res.json({ experiments: withStats });
  } catch (err) {
    console.error("[admin/ab] GET error:", err);
    return sendError(res, 500, "Errore lettura esperimenti A/B");
  }
});

router.get("/ab-experiments/:key", async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);
    const [exp] = await db.select().from(abExperiments).where(eq(abExperiments.key, key)).limit(1);
    if (!exp) return sendError(res, 404, "Esperimento non trovato");
    const stats = await getExperimentStats(exp.key);
    const comparison = computeComparison(stats);
    return res.json({ experiment: exp, stats, comparison });
  } catch (err) {
    console.error("[admin/ab] GET detail error:", err);
    return sendError(res, 500, "Errore lettura esperimento");
  }
});

router.post("/ab-experiments", async (req: Request, res: Response) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const { key, description, variants, status } = parsed.data;
    const [existing] = await db.select().from(abExperiments).where(eq(abExperiments.key, key)).limit(1);
    if (existing) return sendError(res, 409, "Chiave già esistente");
    const [row] = await db.insert(abExperiments).values({
      key,
      description: description ?? null,
      variants,
      status,
    }).returning();
    invalidateAbCache(key);
    return res.json(row);
  } catch (err) {
    console.error("[admin/ab] POST error:", err);
    return sendError(res, 500, "Errore creazione esperimento");
  }
});

router.patch("/ab-experiments/:key", async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.variants !== undefined) updates.variants = parsed.data.variants;
    if (parsed.data.status !== undefined) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "ended") updates.endedAt = new Date();
    }
    const [row] = await db.update(abExperiments).set(updates).where(eq(abExperiments.key, key)).returning();
    if (!row) return sendError(res, 404, "Esperimento non trovato");
    invalidateAbCache(key);
    return res.json(row);
  } catch (err) {
    console.error("[admin/ab] PATCH error:", err);
    return sendError(res, 500, "Errore aggiornamento esperimento");
  }
});

router.delete("/ab-experiments/:key", async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);
    await db.delete(abAssignments).where(eq(abAssignments.experimentKey, key));
    const result = await db.delete(abExperiments).where(eq(abExperiments.key, key)).returning();
    if (result.length === 0) return sendError(res, 404, "Esperimento non trovato");
    invalidateAbCache(key);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/ab] DELETE error:", err);
    return sendError(res, 500, "Errore eliminazione esperimento");
  }
});

interface VariantMetrics {
  variant: string;
  users: number;
  events: Record<string, number>;
  acceptRate: number | null;
  chatRate: number | null;
}

interface PairComparison {
  baseline: string;
  challenger: string;
  metric: string;
  baselineRate: number;
  challengerRate: number;
  pValue: number | null;
  significant: boolean;
}

/**
 * Computes accept-rate and chat-rate for each variant plus pairwise two-proportion
 * z-tests via simple-statistics. p < 0.05 is flagged as significant.
 */
function computeComparison(
  stats: Array<{ variant: string; users: number; events: Record<string, number> }>,
): { variants: VariantMetrics[]; comparisons: PairComparison[] } {
  const metrics: VariantMetrics[] = stats.map((s) => {
    const created = s.events["match_created"] ?? 0;
    const accepted = s.events["match_accepted"] ?? 0;
    const chatOpened = s.events["chat_opened"] ?? 0;
    return {
      variant: s.variant,
      users: s.users,
      events: s.events,
      acceptRate: created > 0 ? accepted / created : null,
      chatRate: created > 0 ? chatOpened / created : null,
    };
  });

  const comparisons: PairComparison[] = [];
  for (let i = 0; i < metrics.length; i++) {
    for (let j = i + 1; j < metrics.length; j++) {
      const a = metrics[i];
      const b = metrics[j];
      for (const metric of ["match_accepted", "chat_opened"] as const) {
        const baseSuccess = a.events[metric] ?? 0;
        const baseTrials = a.events["match_created"] ?? 0;
        const chalSuccess = b.events[metric] ?? 0;
        const chalTrials = b.events["match_created"] ?? 0;
        if (baseTrials < 5 || chalTrials < 5) continue;
        const p = twoProportionZTestP(baseSuccess, baseTrials, chalSuccess, chalTrials);
        comparisons.push({
          baseline: a.variant,
          challenger: b.variant,
          metric,
          baselineRate: baseSuccess / baseTrials,
          challengerRate: chalSuccess / chalTrials,
          pValue: p,
          significant: p !== null && p < 0.05,
        });
      }
    }
  }
  return { variants: metrics, comparisons };
}

/**
 * Two-proportion z-test (pooled). Returns two-tailed p-value or null when
 * variances collapse (degenerate samples).
 */
function twoProportionZTestP(x1: number, n1: number, x2: number, n2: number): number | null {
  if (n1 <= 0 || n2 <= 0) return null;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pPool = (x1 + x2) / (n1 + n2);
  const variance = pPool * (1 - pPool) * (1 / n1 + 1 / n2);
  if (variance <= 0) return null;
  const z = (p1 - p2) / Math.sqrt(variance);
  // Two-tailed p-value via standard normal CDF from simple-statistics.
  const cdf = ss.cumulativeStdNormalProbability(-Math.abs(z));
  return Math.min(1, 2 * cdf);
}

export default router;
