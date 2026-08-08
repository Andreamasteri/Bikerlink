import { haversineDistance } from "../geo";
import { matchThresholds, appSettings, type Proposal } from "@shared/db";
import { eq, sql, type SQL } from "drizzle-orm";
import { sameDay, timeRangesOverlap } from "./filters";
import { areCompatibleByRule, getRuleWeight as _getRuleWeight } from "./rules-cache";
import { db } from "../db";

export { _getRuleWeight as getRuleWeight };

/* ============================================================================
 * Tag-overlap scoring (Task #2513)
 *
 * Le categorie tag (musica, stile_guida, tipo_moto) sono normalizzate dal
 * sistema tag generico (task #2512). Per ogni coppia di utenti calcoliamo:
 *   - common  : numero di tag in comune
 *   - jaccard : |A ∩ B| / |A ∪ B|         (0 se entrambi vuoti)
 *   - overlap : |A ∩ B| / min(|A|,|B|)    (0 se uno dei due è vuoto)
 *
 * La soglia di compatibilità per categoria è caricata da `match_thresholds`
 * con cache in-process invalidabile via `invalidateMatchThresholdsCache()`.
 * Un match è "Supermatch" se almeno N categorie (default 3, configurabile
 * via app_settings `match_supermatch_min_categories`) superano la soglia.
 * ============================================================================ */

export type TagOverlap = { common: number; jaccard: number; overlap: number };

export function tagOverlap(tagsA: Iterable<string>, tagsB: Iterable<string>): TagOverlap {
  const setA = tagsA instanceof Set ? tagsA : new Set(tagsA);
  const setB = tagsB instanceof Set ? tagsB : new Set(tagsB);
  if (setA.size === 0 && setB.size === 0) return { common: 0, jaccard: 0, overlap: 0 };
  let common = 0;
  for (const t of setA) if (setB.has(t)) common++;
  const union = setA.size + setB.size - common;
  const jaccard = union > 0 ? common / union : 0;
  const minSize = Math.min(setA.size, setB.size);
  const overlap = minSize > 0 ? common / minSize : 0;
  return { common, jaccard, overlap };
}

export type CategoryThreshold = { jaccardThreshold: number; minCommonTags: number };
export type ThresholdsMap = Map<string, CategoryThreshold>;

const DEFAULT_THRESHOLDS: ThresholdsMap = new Map([
  ["musica",      { jaccardThreshold: 0.25, minCommonTags: 1 }],
  ["stile_guida", { jaccardThreshold: 0.30, minCommonTags: 1 }],
  ["tipo_moto",   { jaccardThreshold: 0.30, minCommonTags: 1 }],
]);

const THRESHOLDS_CACHE_TTL_MS = 5 * 60 * 1000;

let thresholdsCache: ThresholdsMap | null = null;
let thresholdsCachedAt = 0;
let supermatchMinCategoriesCache: number | null = null;
let supermatchMinCategoriesCachedAt = 0;

export function invalidateMatchThresholdsCache(): void {
  thresholdsCache = null;
  thresholdsCachedAt = 0;
  supermatchMinCategoriesCache = null;
  supermatchMinCategoriesCachedAt = 0;
}

export async function loadMatchThresholds(): Promise<ThresholdsMap> {
  const now = Date.now();
  if (thresholdsCache && now - thresholdsCachedAt < THRESHOLDS_CACHE_TTL_MS) return thresholdsCache;
  try {
    const rows = await db.select().from(matchThresholds);
    const map: ThresholdsMap = new Map(DEFAULT_THRESHOLDS);
    for (const r of rows) {
      map.set(r.category, {
        jaccardThreshold: r.jaccardThreshold,
        minCommonTags: r.minCommonTags,
      });
    }
    thresholdsCache = map;
    thresholdsCachedAt = now;
    return map;
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function getThresholdSync(category: string, thresholds: ThresholdsMap): CategoryThreshold {
  return thresholds.get(category) ?? DEFAULT_THRESHOLDS.get(category) ?? { jaccardThreshold: 0.3, minCommonTags: 1 };
}

export async function getSupermatchMinCategories(): Promise<number> {
  const now = Date.now();
  if (supermatchMinCategoriesCache != null && now - supermatchMinCategoriesCachedAt < THRESHOLDS_CACHE_TTL_MS) return supermatchMinCategoriesCache;
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "match_supermatch_min_categories")).limit(1);
    const raw = row?.value ?? "3";
    const parsed = parseInt(String(raw), 10);
    supermatchMinCategoriesCache = Number.isFinite(parsed) && parsed >= 1 ? parsed : 3;
    supermatchMinCategoriesCachedAt = now;
  } catch {
    supermatchMinCategoriesCache = 3;
    supermatchMinCategoriesCachedAt = now;
  }
  return supermatchMinCategoriesCache;
}

/**
 * Score breakdown persistito nella colonna `score_breakdown jsonb`. Tutti
 * i campi sono opzionali — vengono valorizzati solo per le categorie che
 * partecipano al matcher in corso.
 */
export type ScoreBreakdown = {
  musicScore?: number;        // jaccard 0..1
  styleScore?: number;        // jaccard 0..1
  bikeTypeScore?: number;     // jaccard 0..1
  musicCommon?: number;
  styleCommon?: number;
  bikeTypeCommon?: number;
  // Task #2516 — affinità musicale combinata (tag + embedding).
  musicEmbeddingScore?: number; // cosine 0..1
  combinedMusicScore?: number;  // tagJaccard*w1 + embSim*w2, 0..1
  musicWeightTag?: number;      // w1 effettivo usato (per audit)
  musicWeightEmbedding?: number; // w2 effettivo usato (per audit)
};

/**
 * Task #2516 — Combina tag-overlap musicale e cosine-similarity
 * dell'embedding `music_taste` in un singolo score 0..1.
 * Default pesi 0.5/0.5; valori fuori [0,1] vengono clampati.
 */
export function combinedMusicScore(
  tagJaccard: number,
  embeddingSim: number,
  weightTag = 0.5,
  weightEmbedding = 0.5,
): number {
  const wt = Math.max(0, Math.min(1, weightTag));
  const we = Math.max(0, Math.min(1, weightEmbedding));
  const tj = Math.max(0, Math.min(1, tagJaccard));
  const es = Math.max(0, Math.min(1, embeddingSim));
  return tj * wt + es * we;
}

/**
 * Conta quante categorie nel breakdown superano la soglia. Una categoria
 * non presente nel breakdown non viene contata.
 */
export function countCategoriesAboveThreshold(
  breakdown: ScoreBreakdown,
  thresholds: ThresholdsMap,
): number {
  let n = 0;
  const check = (score: number | undefined, common: number | undefined, cat: string) => {
    if (score == null) return;
    const t = getThresholdSync(cat, thresholds);
    if (score >= t.jaccardThreshold && (common ?? 0) >= t.minCommonTags) n++;
  };
  check(breakdown.musicScore, breakdown.musicCommon, "musica");
  check(breakdown.styleScore, breakdown.styleCommon, "stile_guida");
  check(breakdown.bikeTypeScore, breakdown.bikeTypeCommon, "tipo_moto");
  return n;
}

export function isSupermatchByBreakdown(
  breakdown: ScoreBreakdown,
  thresholds: ThresholdsMap,
  minCategories: number,
): boolean {
  return countCategoriesAboveThreshold(breakdown, thresholds) >= minCategories;
}

/**
 * Freshness/Decay configuration (task 2524).
 *
 * I match perdono rilevanza nel tempo seguendo una decadenza esponenziale:
 *   freshness(ageDays) = 0.5 ^ (ageDays / halfLife)
 *
 * Half-life di default:
 *   - generic (biker-biker, biker-zavorrina): 7 giorni
 *   - proposal (proposte di uscita, scadono in fretta): 2 giorni
 *
 * Override globali via app_settings:
 *   - match_freshness_halflife_generic_days
 *   - match_freshness_halflife_proposal_days
 *   - match_archive_after_days
 */
export const FRESHNESS_DEFAULTS = {
  halfLifeGenericDays: 7,
  halfLifeProposalDays: 2,
  archiveAfterDays: 30,
  freshThreshold: 0.6,
} as const;

export type FreshnessKind = "generic" | "proposal";

export function freshnessMultiplier(
  ageDays: number,
  kind: FreshnessKind = "generic",
  halfLifeOverrideDays?: number,
): number {
  const halfLife =
    halfLifeOverrideDays && halfLifeOverrideDays > 0
      ? halfLifeOverrideDays
      : kind === "proposal"
        ? FRESHNESS_DEFAULTS.halfLifeProposalDays
        : FRESHNESS_DEFAULTS.halfLifeGenericDays;
  const age = Math.max(0, ageDays);
  return Math.pow(0.5, age / halfLife);
}

/**
 * Costruisce l'espressione SQL per la freshness di un match basata su
 * `created_at`. Restituisce un valore in [0, 1].
 *
 *   EXP( -LN(2) * ageDays / halfLife )
 *   = 0.5 ^ (ageDays / halfLife)
 */
export function freshnessSql(createdAtCol: SQL | unknown, halfLifeDays: number): SQL {
  const hl = Math.max(0.01, halfLifeDays);
  return sql`EXP(
    -0.6931471805599453 *
    (EXTRACT(EPOCH FROM (NOW() - ${createdAtCol as SQL})) / 86400.0) /
    ${hl}
  )`;
}

/**
 * Score dinamico = baseScore * freshness. baseScore di default = 1 (oppure 2
 * per i supermatch); la dimensione "anzianità" è gestita esclusivamente dalla
 * freshness, quindi `ORDER BY dynamicScore DESC` restituisce i match più
 * pertinenti prima.
 */
export function dynamicScoreSql(
  createdAtCol: SQL | unknown,
  halfLifeDays: number,
  baseScoreSql?: SQL,
): SQL {
  const base = baseScoreSql ?? sql`1.0`;
  return sql`(${base}) * ${freshnessSql(createdAtCol, halfLifeDays)}`;
}

type ProposalWithAuthor = Proposal & { authorUserType?: string | null };

export function deriveTargetUserTypes(p: ProposalWithAuthor): string[] {
  const explicit = Array.isArray(p.targetUserTypes) ? (p.targetUserTypes as string[]) : null;
  if (explicit && explicit.length > 0) return explicit;
  switch (p.searchType) {
    case "find_a_friend":  return ["biker", "coppia"];
    case "find_a_biker":   return ["biker", "coppia"];
    case "find_a_guest":   return ["zavorrina", "coppia"];
    case "hitchhiker":     return ["biker", "coppia"];
    case "hitcher":        return ["zavorrina", "coppia"];
    default:               return ["biker", "zavorrina", "coppia"];
  }
}

export function getAllSearchTypes(p: ProposalWithAuthor): string[] {
  const types: string[] = [];
  if (Array.isArray(p.searchTypes)) {
    for (const t of p.searchTypes as string[]) {
      if (t && !types.includes(t)) types.push(t);
    }
  }
  if (p.searchType && !types.includes(p.searchType)) {
    types.push(p.searchType);
  }
  return types;
}

export function resolveMatchPool(p1: ProposalWithAuthor, p2: ProposalWithAuthor): boolean {
  const hasExplicit1 = Array.isArray(p1.targetUserTypes) && (p1.targetUserTypes as string[]).length > 0;
  const hasExplicit2 = Array.isArray(p2.targetUserTypes) && (p2.targetUserTypes as string[]).length > 0;

  if (!hasExplicit1 && !hasExplicit2) {
    const types1 = getAllSearchTypes(p1);
    const types2 = getAllSearchTypes(p2);
    if (types1.length === 0 || types2.length === 0) return false;
    for (const t1 of types1) {
      for (const t2 of types2) {
        if (areCompatibleByRule(t1, t2)) return true;
      }
    }
    return false;
  }

  const targets1 = deriveTargetUserTypes(p1);
  const targets2 = deriveTargetUserTypes(p2);
  const intentTargets = new Set(["hitcher", "hitchhiker"]);
  // Older/client-created proposals stored search intents in targetUserTypes.
  // Those values are not users.userType values, so resolve them through the
  // canonical search-type rules instead of comparing them to author roles.
  if (targets1.some((t) => intentTargets.has(t)) || targets2.some((t) => intentTargets.has(t))) {
    const types1 = getAllSearchTypes(p1);
    const types2 = getAllSearchTypes(p2);
    return types1.some((t1) => types2.some((t2) => areCompatibleByRule(t1, t2)));
  }
  const type1 = p1.authorUserType ?? "biker";
  const type2 = p2.authorUserType ?? "biker";
  return targets1.includes(type2) && targets2.includes(type1);
}

export function routesIntersect(p1: ProposalWithAuthor, p2: ProposalWithAuthor): boolean {
  if (
    p1.departureLatitude != null && p1.departureLongitude != null &&
    p2.departureLatitude != null && p2.departureLongitude != null
  ) {
    const distance = haversineDistance(
      p1.departureLatitude, p1.departureLongitude,
      p2.departureLatitude, p2.departureLongitude
    );
    const radius1 = p1.searchRadius || 50;
    const radius2 = p2.searchRadius || 50;
    if (distance <= Math.min(radius1, radius2)) return true;
  }

  if (
    p1.extendToDestination &&
    p1.destinationLatitude != null && p1.destinationLongitude != null &&
    p2.departureLatitude != null && p2.departureLongitude != null
  ) {
    const destRadius1 = p1.destinationSearchRadius || 30;
    const distDest1 = haversineDistance(
      p1.destinationLatitude, p1.destinationLongitude,
      p2.departureLatitude, p2.departureLongitude
    );
    if (distDest1 <= destRadius1) return true;
  }

  if (
    p2.extendToDestination &&
    p2.destinationLatitude != null && p2.destinationLongitude != null &&
    p1.departureLatitude != null && p1.departureLongitude != null
  ) {
    const destRadius2 = p2.destinationSearchRadius || 30;
    const distDest2 = haversineDistance(
      p2.destinationLatitude, p2.destinationLongitude,
      p1.departureLatitude, p1.departureLongitude
    );
    if (distDest2 <= destRadius2) return true;
  }

  return false;
}

export function areCompatible(p1: ProposalWithAuthor, p2: ProposalWithAuthor): boolean {
  if (p1.userId === p2.userId) return false;
  if (!resolveMatchPool(p1, p2)) return false;

  const date1 = p1.scheduledAt || p1.departureTimeFrom;
  const date2 = p2.scheduledAt || p2.departureTimeFrom;
  if (!sameDay(date1, date2)) return false;
  if (!timeRangesOverlap(p1.departureTimeFrom, p1.departureTimeTo, p2.departureTimeFrom, p2.departureTimeTo)) return false;

  return routesIntersect(p1, p2);
}

export function baseModelName(model: string): string {
  return model.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function routeProfileOf(avgSpeed: number, avgTilt: number, avgDist: number): string {
  if (avgTilt > 30) return "curvy";
  if (avgSpeed > 100) return "highway";
  if (avgDist < 30) return "city";
  return "mixed";
}
