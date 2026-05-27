import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { abExperiments, abAssignments, abEvents, type AbExperiment } from "@shared/db";

type Variant = { name: string; weight: number; config?: Record<string, unknown> };

const expCache = new Map<string, { exp: AbExperiment | null; ts: number }>();
const assignmentCache = new Map<string, string>();
const CACHE_TTL_MS = 60_000;

async function loadExperiment(key: string): Promise<AbExperiment | null> {
  const cached = expCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.exp;
  const [row] = await db.select().from(abExperiments).where(eq(abExperiments.key, key)).limit(1);
  const exp = row ?? null;
  expCache.set(key, { exp, ts: Date.now() });
  return exp;
}

export function invalidateAbCache(key?: string): void {
  if (key) {
    expCache.delete(key);
    for (const k of [...assignmentCache.keys()]) {
      if (k.endsWith(`:${key}`)) assignmentCache.delete(k);
    }
  } else {
    expCache.clear();
    assignmentCache.clear();
  }
}

function pickVariantByHash(userId: string, key: string, variants: Variant[]): string {
  const totalWeight = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (totalWeight <= 0) return variants[0]?.name ?? "control";
  const h = createHash("sha1").update(`${userId}:${key}`).digest();
  const bucket = (h.readUInt32BE(0) / 0xffffffff) * totalWeight;
  let acc = 0;
  for (const v of variants) {
    acc += Math.max(0, v.weight);
    if (bucket < acc) return v.name;
  }
  return variants[variants.length - 1].name;
}

/**
 * Returns the variant name assigned to `userId` for `experimentKey`.
 * Sticky: once assigned, the user stays in the same variant.
 * Returns "control" when the experiment is missing/inactive so callers can branch safely.
 */
export async function getVariant(userId: string, experimentKey: string): Promise<string> {
  if (!userId || !experimentKey) return "control";
  const cacheKey = `${userId}:${experimentKey}`;
  const cached = assignmentCache.get(cacheKey);
  if (cached) return cached;

  const exp = await loadExperiment(experimentKey);
  if (!exp || exp.status !== "running" || !Array.isArray(exp.variants) || exp.variants.length === 0) {
    assignmentCache.set(cacheKey, "control");
    return "control";
  }

  const [existing] = await db
    .select()
    .from(abAssignments)
    .where(and(eq(abAssignments.experimentKey, experimentKey), eq(abAssignments.userId, userId)))
    .limit(1);
  if (existing) {
    assignmentCache.set(cacheKey, existing.variant);
    return existing.variant;
  }

  const variant = pickVariantByHash(userId, experimentKey, exp.variants as Variant[]);
  try {
    await db.insert(abAssignments)
      .values({ experimentKey, userId, variant })
      .onConflictDoNothing();
  } catch (err) {
    console.warn(`[ab] assignment insert failed exp=${experimentKey} user=${userId}:`, (err as Error).message);
  }
  assignmentCache.set(cacheKey, variant);
  return variant;
}

/**
 * Returns the full variant config (weight, custom config) for branching logic.
 */
export async function getVariantConfig(
  userId: string,
  experimentKey: string,
): Promise<{ name: string; config: Record<string, unknown> }> {
  const name = await getVariant(userId, experimentKey);
  const exp = await loadExperiment(experimentKey);
  const v = (exp?.variants as Variant[] | undefined)?.find((x) => x.name === name);
  return { name, config: v?.config ?? {} };
}

/**
 * Records an event tied to the user's variant in the experiment.
 * Silent no-op when the experiment is missing/inactive so matchers can call freely.
 */
export async function trackAbEvent(
  userId: string,
  experimentKey: string,
  eventName: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    if (!userId || !experimentKey || !eventName) return;
    const exp = await loadExperiment(experimentKey);
    if (!exp || exp.status !== "running") return;
    const variant = await getVariant(userId, experimentKey);
    await db.insert(abEvents).values({
      experimentKey,
      variant,
      userId,
      eventName: eventName.substring(0, 60),
      payload: payload ?? null,
    });
  } catch (err) {
    console.warn(`[ab] trackAbEvent failed exp=${experimentKey} event=${eventName}:`, (err as Error).message);
  }
}

export interface VariantStats {
  variant: string;
  users: number;
  events: Record<string, number>;
}

/**
 * Aggregates assignments + event counts grouped by variant.
 */
export async function getExperimentStats(experimentKey: string): Promise<VariantStats[]> {
  const assignments = await db
    .select({ variant: abAssignments.variant, cnt: sql<number>`count(*)::int` })
    .from(abAssignments)
    .where(eq(abAssignments.experimentKey, experimentKey))
    .groupBy(abAssignments.variant);

  const events = await db
    .select({
      variant: abEvents.variant,
      eventName: abEvents.eventName,
      cnt: sql<number>`count(*)::int`,
    })
    .from(abEvents)
    .where(eq(abEvents.experimentKey, experimentKey))
    .groupBy(abEvents.variant, abEvents.eventName);

  const map = new Map<string, VariantStats>();
  for (const row of assignments) {
    map.set(row.variant, { variant: row.variant, users: Number(row.cnt), events: {} });
  }
  for (const row of events) {
    const entry = map.get(row.variant) ?? { variant: row.variant, users: 0, events: {} };
    entry.events[row.eventName] = Number(row.cnt);
    map.set(row.variant, entry);
  }
  return [...map.values()].sort((a, b) => a.variant.localeCompare(b.variant));
}
