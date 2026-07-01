import { db } from "../db";
import { matchRules, type MatchRuleRow } from "@shared/db";
import { matchingLogger } from "../lib/logger";
import { cacheDel, cacheGet, cacheSet } from "../cache/cache";

const RULES_CACHE_NS = "match-rules";
const RULES_CACHE_KEY = "all";
const RULES_CACHE_TTL_S = 300;

type CacheEntry = { compatible: boolean; weight: number };

/**
 * Default rules — mirror the seed in migrations/0040_match_rules.sql.
 * Used as a fallback when the DB cache is not yet initialized (e.g. in unit
 * tests or before Phase 5). The DB is the source of truth at runtime.
 */
export const DEFAULT_MATCH_RULES: Array<{ searchTypeA: string; searchTypeB: string; compatible: boolean; weight: number }> = [
  { searchTypeA: "find_a_friend", searchTypeB: "find_a_friend", compatible: true, weight: 1 },
  { searchTypeA: "find_a_guest",  searchTypeB: "find_a_biker",  compatible: true, weight: 1 },
  { searchTypeA: "hitcher",       searchTypeB: "hitchhiker",    compatible: true, weight: 1 },
  { searchTypeA: "find_a_guest",  searchTypeB: "hitchhiker",    compatible: true, weight: 1 },
  { searchTypeA: "hitcher",       searchTypeB: "find_a_biker",  compatible: true, weight: 1 },
];

function buildDefaultCache(): Map<string, CacheEntry> {
  const m = new Map<string, CacheEntry>();
  for (const r of DEFAULT_MATCH_RULES) {
    m.set(key(r.searchTypeA, r.searchTypeB), { compatible: r.compatible, weight: r.weight });
  }
  return m;
}

let cache: Map<string, CacheEntry> | null = null;
let loading: Promise<void> | null = null;

function key(a: string, b: string): string {
  return `${a}::${b}`;
}

function symmetricKeys(a: string, b: string): [string, string] {
  return [key(a, b), key(b, a)];
}

type SerialisedRule = { a: string; b: string; compatible: boolean; weight: number };

async function loadFromDb(): Promise<void> {
  // First try DragonflyDB-mirrored cache so multi-instance deployments share warm state.
  const cached = await cacheGet<SerialisedRule[]>(RULES_CACHE_NS, RULES_CACHE_KEY);
  if (cached && Array.isArray(cached)) {
    const m = new Map<string, CacheEntry>();
    for (const r of cached) {
      m.set(key(r.a, r.b), { compatible: r.compatible, weight: r.weight });
    }
    cache = m;
    matchingLogger.info({ rules: m.size, source: "dragonfly" }, "match-rules cache loaded");
    return;
  }
  const rows = await db.select().from(matchRules);
  const map = new Map<string, CacheEntry>();
  const serialised: SerialisedRule[] = [];
  for (const row of rows) {
    map.set(key(row.searchTypeA, row.searchTypeB), {
      compatible: row.compatible,
      weight: row.weight,
    });
    serialised.push({ a: row.searchTypeA, b: row.searchTypeB, compatible: row.compatible, weight: row.weight });
  }
  cache = map;
  void cacheSet(RULES_CACHE_NS, RULES_CACHE_KEY, serialised, RULES_CACHE_TTL_S);
  matchingLogger.info({ rules: map.size, source: "db" }, "match-rules cache loaded");
}

export async function initMatchRulesCache(): Promise<void> {
  if (cache) return;
  if (!loading) loading = loadFromDb().finally(() => { loading = null; });
  await loading;
}

export function invalidateMatchRulesCache(): void {
  cache = null;
  // Also clear any DragonflyDB-backed mirror so other instances refetch.
  void cacheDel(RULES_CACHE_NS, RULES_CACHE_KEY);
}

function ensureCacheSync(): Map<string, CacheEntry> {
  if (cache) return cache;
  // Lazy fire-and-forget reload so subsequent calls succeed. Until the DB
  // load completes we fall back to DEFAULT_MATCH_RULES so behaviour matches
  // the seed and unit tests / pre-boot calls keep working.
  if (!loading) {
    loading = loadFromDb().catch((err) => {
      matchingLogger.error({ err }, "match-rules cache reload failed");
    }).finally(() => { loading = null; });
  }
  return cache ?? buildDefaultCache();
}

export function getRule(a: string, b: string): CacheEntry | undefined {
  const m = ensureCacheSync();
  const [k1, k2] = symmetricKeys(a, b);
  return m.get(k1) ?? m.get(k2);
}

export function areCompatibleByRule(a: string, b: string): boolean {
  const r = getRule(a, b);
  return !!r && r.compatible;
}

export function getRuleWeight(a: string, b: string): number {
  const r = getRule(a, b);
  return r && r.compatible ? r.weight : 0;
}

export function getAllRulesFromCache(): Array<{ searchTypeA: string; searchTypeB: string; compatible: boolean; weight: number }> {
  const m = ensureCacheSync();
  const out: Array<{ searchTypeA: string; searchTypeB: string; compatible: boolean; weight: number }> = [];
  for (const [k, v] of m.entries()) {
    const [a, b] = k.split("::");
    out.push({ searchTypeA: a, searchTypeB: b, compatible: v.compatible, weight: v.weight });
  }
  return out;
}

export function _setCacheForTests(rows: MatchRuleRow[]): void {
  const map = new Map<string, CacheEntry>();
  for (const r of rows) {
    map.set(key(r.searchTypeA, r.searchTypeB), { compatible: r.compatible, weight: r.weight });
  }
  cache = map;
}
