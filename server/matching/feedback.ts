import { db } from "../db";
import { sql, and, eq, gte, lt, isNull } from "drizzle-orm";
import {
  matchFeedback,
  userMatchProfile,
  bikerBikerMatches,
  bikerZavorrinaMatches,
  proposalMatches,
  proposalProfileMatches,
  type FeatureWeights,
  type FeatureStats,
  type InsertMatchFeedback,
} from "@shared/db";

export type FeedbackAction = "accept" | "reject" | "ignore" | "block";
export type MatchKind = "biker" | "garage" | "proposal" | "propProfile";

export const MIN_PERSONAL_FEEDBACK = 10;
export const MIN_FEATURE_SAMPLES = 3;
export const WEIGHT_MIN = 0.3;
export const WEIGHT_MAX = 1.7;
export const GLOBAL_DEFAULT_ACCEPT_RATE = 0.5;

/**
 * Map a `motorcycle_brand` bucket (as used in biker_biker_matches) to a stable
 * personalization feature key. Strips the dynamic value (e.g. "tipo:naked" → "type:type_style").
 */
export function featureKeyForBikerBucket(brand: string | null | undefined): string {
  const b = (brand ?? "").toLowerCase();
  if (!b) return "type:brand";
  if (b.startsWith("tipo_zav:")) return "type:type_style_zav";
  if (b.startsWith("tipo:")) return "type:type_style";
  if (b.startsWith("club_zav:")) return "type:club_zav";
  if (b.startsWith("club:")) return "type:club";
  if (b === "distanza") return "type:distance";
  if (b === "distanza_zav") return "type:distance_zav";
  if (b === "musica") return "type:music";
  if (b === "musica_zav") return "type:music_zav";
  if (b === "eventi") return "type:events";
  if (b.startsWith("gps_")) return `type:${b}`;
  if (b.startsWith("zona_zav:")) return "type:route_zone_zav";
  if (b.startsWith("zona_bb:") || b.startsWith("zona:")) return "type:route_zone";
  if (b.startsWith("percorso_zav:")) return "type:route_type_zav";
  if (b.startsWith("percorso:") || b.startsWith("percorso")) return "type:route_type";
  // Default: brand-based match keyed by brand label (lowercased, normalized)
  return `brand:${b.replace(/[^a-z0-9_-]+/g, "_").slice(0, 60)}`;
}

export function featureKeyForKind(kind: MatchKind, detail?: string | null): string {
  switch (kind) {
    case "biker":      return featureKeyForBikerBucket(detail);
    case "garage":     return "type:garage_brand";
    case "proposal":   return "type:proposal";
    case "propProfile": return "type:proposal_profile";
  }
}

/**
 * Fire-and-forget feedback writer. Never throws to the caller — feedback must
 * never break the user-facing accept/reject HTTP path.
 */
export function recordMatchFeedbackFireAndForget(input: InsertMatchFeedback): void {
  void db.insert(matchFeedback).values(input).then(
    () => undefined,
    (err: unknown) => console.error("[MatchFeedback] insert failed:", err),
  );
}

export async function getUserMatchProfile(userId: string) {
  const [row] = await db.select().from(userMatchProfile).where(eq(userMatchProfile.userId, userId)).limit(1);
  return row;
}

export async function upsertUserMatchProfile(
  userId: string,
  weights: FeatureWeights,
  stats: FeatureStats,
  feedbackCount: number,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO user_match_profile (user_id, feature_weights, feature_stats, feedback_count, updated_at)
    VALUES (${userId}, ${JSON.stringify(weights)}::jsonb, ${JSON.stringify(stats)}::jsonb, ${feedbackCount}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      feature_weights = EXCLUDED.feature_weights,
      feature_stats   = EXCLUDED.feature_stats,
      feedback_count  = EXCLUDED.feedback_count,
      updated_at      = NOW()
  `);
}

/**
 * Compute per-feature acceptance stats and personalized weights for a user
 * based on their feedback history. Weights are clamped to [WEIGHT_MIN, WEIGHT_MAX].
 *
 * Uses simple-statistics for accept-rate computation to keep formulas auditable.
 */
export async function computeProfileForUser(userId: string): Promise<{
  weights: FeatureWeights;
  stats: FeatureStats;
  totalFeedback: number;
}> {
  const rows = await db
    .select({
      featureKey: matchFeedback.featureKey,
      action: matchFeedback.action,
    })
    .from(matchFeedback)
    .where(eq(matchFeedback.userId, userId));

  const stats: FeatureStats = {};
  for (const r of rows) {
    const f = r.featureKey;
    if (!stats[f]) stats[f] = { accepts: 0, rejects: 0, ignores: 0, total: 0, acceptRate: 0 };
    stats[f].total += 1;
    if (r.action === "accept") stats[f].accepts += 1;
    else if (r.action === "reject" || r.action === "block") stats[f].rejects += 1;
    else if (r.action === "ignore") stats[f].ignores += 1;
  }

  const { mean } = await import("simple-statistics");

  // Global accept rate per feature (across all users) for fallback comparison.
  const globalRows = await db
    .select({
      featureKey: matchFeedback.featureKey,
      action: matchFeedback.action,
    })
    .from(matchFeedback);
  const globalCounts: Record<string, { accepts: number; rejects: number }> = {};
  for (const r of globalRows) {
    if (!globalCounts[r.featureKey]) globalCounts[r.featureKey] = { accepts: 0, rejects: 0 };
    if (r.action === "accept") globalCounts[r.featureKey].accepts += 1;
    else if (r.action === "reject" || r.action === "block" || r.action === "ignore") {
      globalCounts[r.featureKey].rejects += 1;
    }
  }

  const weights: FeatureWeights = {};
  for (const [feature, s] of Object.entries(stats)) {
    const decisive = s.accepts + s.rejects;
    s.acceptRate = decisive > 0 ? s.accepts / decisive : 0;
    if (s.total < MIN_FEATURE_SAMPLES) continue; // not enough samples for this feature
    const gc = globalCounts[feature];
    const globalAccept = gc && gc.accepts + gc.rejects > 0
      ? gc.accepts / (gc.accepts + gc.rejects)
      : GLOBAL_DEFAULT_ACCEPT_RATE;
    const baseline = mean([globalAccept, GLOBAL_DEFAULT_ACCEPT_RATE]);
    // Weight = personalAcceptRate / baseline, clamped.
    const raw = baseline > 0 ? s.acceptRate / baseline : 1;
    weights[feature] = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, raw));
  }

  return { weights, stats, totalFeedback: rows.length };
}

/**
 * Apply personalized weighting to a match score. For users with < MIN_PERSONAL_FEEDBACK
 * total feedback, the weight defaults to 1 (cold-start).
 */
export function personalWeight(
  weights: FeatureWeights | null | undefined,
  feedbackCount: number,
  featureKey: string,
): number {
  if (!weights || feedbackCount < MIN_PERSONAL_FEEDBACK) return 1;
  const w = weights[featureKey];
  return typeof w === "number" && isFinite(w) ? w : 1;
}

/**
 * Score a match (for ranking purposes) using a base of 1.0 + supermatch bonus,
 * multiplied by the user's personal weight for that feature.
 */
export function scoreMatchForUser(opts: {
  weights: FeatureWeights | null | undefined;
  feedbackCount: number;
  featureKey: string;
  isSupermatch?: boolean;
  recencyBoost?: number; // 0..1
}): number {
  const base = 1 + (opts.isSupermatch ? 0.5 : 0) + (opts.recencyBoost ?? 0) * 0.2;
  return base * personalWeight(opts.weights, opts.feedbackCount, opts.featureKey);
}

const FEATURE_LABEL_IT: Record<string, string> = {
  "type:brand":            "Stessa marca di moto",
  "type:type_style":       "Stesso tipo e stile di guida",
  "type:type_style_zav":   "Compatibilità tipo/stile con la zavorrina",
  "type:club":             "Stesso club moto",
  "type:club_zav":         "Club moto in comune (lui/lei)",
  "type:distance":         "Distanza percorsa simile",
  "type:distance_zav":     "Distanza compatibile con la zavorrina",
  "type:music":            "Gusti musicali compatibili",
  "type:music_zav":        "Musica compatibile con la zavorrina",
  "type:events":           "Eventi moto in comune",
  "type:gps_tilt":         "Stile di guida simile (angolo di piega)",
  "type:gps_speed":        "Velocità media simile",
  "type:gps_day":          "Stesse fasce orarie di guida",
  "type:gps_full":         "Profilo GPS completo molto simile",
  "type:route_zone":       "Stessa zona di guida",
  "type:route_zone_zav":   "Stessa zona di guida (lui/lei)",
  "type:route_type":       "Stesso tipo di percorso preferito",
  "type:route_type_zav":   "Stesso tipo di percorso (lui/lei)",
  "type:garage_brand":     "Match garage/wishlist su marca moto",
  "type:proposal":         "Proposta di uscita compatibile",
  "type:proposal_profile": "Proposta vicina al tuo profilo",
};

export function describeFeature(key: string): string {
  if (FEATURE_LABEL_IT[key]) return FEATURE_LABEL_IT[key];
  if (key.startsWith("brand:")) return `Stessa marca: ${key.slice(6)}`;
  return key;
}

/**
 * Build an explanation for why a given match was proposed to `userId`, based
 * on the user's personalized weights and the global accept-rate of the bucket.
 */
export async function explainMatchForUser(opts: {
  userId: string;
  featureKey: string;
  isSupermatch?: boolean;
}): Promise<{
  feature: string;
  description: string;
  factors: Array<{ label: string; score: number; positive: boolean }>;
  usingPersonalWeights: boolean;
}> {
  const profile = await getUserMatchProfile(opts.userId);
  const weights = (profile?.featureWeights as FeatureWeights | null) ?? null;
  const stats = (profile?.featureStats as FeatureStats | null) ?? null;
  const feedbackCount = profile?.feedbackCount ?? 0;
  const usingPersonalWeights = feedbackCount >= MIN_PERSONAL_FEEDBACK;

  const factors: Array<{ label: string; score: number; positive: boolean }> = [];

  // Primary factor: the match feature itself.
  const w = personalWeight(weights, feedbackCount, opts.featureKey);
  factors.push({
    label: describeFeature(opts.featureKey),
    score: Math.round(w * 100) / 100,
    positive: w >= 1,
  });

  if (opts.isSupermatch) {
    factors.push({ label: "Supermatch: corrispondenza perfetta", score: 1.5, positive: true });
  }

  // Add up to 2 other strongest positive features from user history.
  if (usingPersonalWeights && weights) {
    const entries = Object.entries(weights)
      .filter(([k]) => k !== opts.featureKey)
      .sort((a, b) => b[1] - a[1]);
    for (const [k, v] of entries.slice(0, 2)) {
      if (v > 1.05) {
        factors.push({ label: `Hai apprezzato: ${describeFeature(k)}`, score: Math.round(v * 100) / 100, positive: true });
      }
    }
    // Worst feature as a negative signal (if very low).
    const worst = entries[entries.length - 1];
    if (worst && worst[1] < 0.7) {
      factors.push({ label: `Tendi a scartare: ${describeFeature(worst[0])}`, score: Math.round(worst[1] * 100) / 100, positive: false });
    }
  }

  // Trim to a sensible cap (top 3 positives + 1 negative).
  const positives = factors.filter(f => f.positive).slice(0, 3);
  const negatives = factors.filter(f => !f.positive).slice(0, 1);
  void stats;

  return {
    feature: opts.featureKey,
    description: describeFeature(opts.featureKey),
    factors: [...positives, ...negatives],
    usingPersonalWeights,
  };
}

/**
 * Mark stale "new" matches as `ignore` feedback if the user has not acted on
 * them within `ignoreAfterDays`. Idempotent — uses match_ref_id to dedupe.
 */
export async function inferIgnoreFeedback(ignoreAfterDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - ignoreAfterDays * 24 * 60 * 60 * 1000);
  let inserted = 0;

  // biker_biker_matches: status=new, older than cutoff, both users get an ignore
  const bbRows = await db
    .select()
    .from(bikerBikerMatches)
    .where(and(eq(bikerBikerMatches.status, "new"), lt(bikerBikerMatches.createdAt, cutoff)));
  for (const m of bbRows) {
    const feature = featureKeyForBikerBucket(m.motorcycleBrand);
    for (const [uid, oid] of [[m.biker1Id, m.biker2Id], [m.biker2Id, m.biker1Id]] as Array<[string, string]>) {
      const exists = await db
        .select({ id: matchFeedback.id })
        .from(matchFeedback)
        .where(and(
          eq(matchFeedback.userId, uid),
          eq(matchFeedback.matchRefId, m.id),
          eq(matchFeedback.action, "ignore"),
        ))
        .limit(1);
      if (exists.length === 0) {
        await db.insert(matchFeedback).values({
          userId: uid, otherUserId: oid, matchKind: "biker",
          featureKey: feature, action: "ignore", matchRefId: m.id,
        });
        inserted++;
      }
    }
  }

  // garage matches
  const bzRows = await db
    .select()
    .from(bikerZavorrinaMatches)
    .where(and(eq(bikerZavorrinaMatches.status, "new"), lt(bikerZavorrinaMatches.createdAt, cutoff)));
  for (const m of bzRows) {
    for (const [uid, oid] of [[m.bikerId, m.zavorrinaId], [m.zavorrinaId, m.bikerId]] as Array<[string, string]>) {
      const exists = await db
        .select({ id: matchFeedback.id })
        .from(matchFeedback)
        .where(and(
          eq(matchFeedback.userId, uid),
          eq(matchFeedback.matchRefId, m.id),
          eq(matchFeedback.action, "ignore"),
        ))
        .limit(1);
      if (exists.length === 0) {
        await db.insert(matchFeedback).values({
          userId: uid, otherUserId: oid, matchKind: "garage",
          featureKey: featureKeyForKind("garage"), action: "ignore", matchRefId: m.id,
        });
        inserted++;
      }
    }
  }

  // proposal matches
  const pmRows = await db
    .select()
    .from(proposalMatches)
    .where(and(eq(proposalMatches.status, "pending"), lt(proposalMatches.createdAt, cutoff)));
  for (const m of pmRows) {
    for (const [uid, oid] of [[m.userId1, m.userId2], [m.userId2, m.userId1]] as Array<[string, string]>) {
      const exists = await db
        .select({ id: matchFeedback.id })
        .from(matchFeedback)
        .where(and(
          eq(matchFeedback.userId, uid),
          eq(matchFeedback.matchRefId, m.id),
          eq(matchFeedback.action, "ignore"),
        ))
        .limit(1);
      if (exists.length === 0) {
        await db.insert(matchFeedback).values({
          userId: uid, otherUserId: oid, matchKind: "proposal",
          featureKey: featureKeyForKind("proposal"), action: "ignore", matchRefId: m.id,
        });
        inserted++;
      }
    }
  }

  // proposal-profile matches
  const ppRows = await db
    .select()
    .from(proposalProfileMatches)
    .where(and(eq(proposalProfileMatches.status, "new"), lt(proposalProfileMatches.createdAt, cutoff)));
  for (const m of ppRows) {
    for (const [uid, oid] of [[m.bikerId, m.zavorrinaId], [m.zavorrinaId, m.bikerId]] as Array<[string, string]>) {
      const exists = await db
        .select({ id: matchFeedback.id })
        .from(matchFeedback)
        .where(and(
          eq(matchFeedback.userId, uid),
          eq(matchFeedback.matchRefId, m.id),
          eq(matchFeedback.action, "ignore"),
        ))
        .limit(1);
      if (exists.length === 0) {
        await db.insert(matchFeedback).values({
          userId: uid, otherUserId: oid, matchKind: "propProfile",
          featureKey: featureKeyForKind("propProfile"), action: "ignore", matchRefId: m.id,
        });
        inserted++;
      }
    }
  }

  void isNull;
  void gte;
  return inserted;
}
