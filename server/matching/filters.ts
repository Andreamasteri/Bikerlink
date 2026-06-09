import { db } from "../db";
import { 
  matchPreferences,
  motoClubMembers,
  users,
  type Proposal
} from "@shared/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { MatchPrefRow, MatchRule } from "./types";

/**
 * Carica l'insieme degli userId da escludere dal matching:
 *  - matching_disabled = true (esplicitamente disabilitati)
 *  - is_system = true (account di servizio: admin, mod, smoke, noreply, ecc.)
 * Usato da tutti gli engine per escludere questi utenti su entrambi i lati del match.
 */
export async function loadMatchingDisabledSet(): Promise<Set<string>> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.matchingDisabled, true), eq(users.isSystem, true)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Ritorna true se NESSUNO dei due userId ha matching_disabled.
 * Helper inline per usare il Set pre-caricato senza query aggiuntive.
 */
export function neitherMatchingDisabled(
  disabledSet: Set<string>,
  userId1: string,
  userId2: string,
): boolean {
  return !disabledSet.has(userId1) && !disabledSet.has(userId2);
}

export async function loadMatchPreferencesMap(): Promise<Map<string, MatchPrefRow>> {
  const rows = await db.select().from(matchPreferences);
  const map = new Map<string, MatchPrefRow>();
  for (const row of rows) {
    map.set(row.userId, row);
  }
  return map;
}

export function prefEnabled(
  map: Map<string, MatchPrefRow>,
  userId: string,
  key: keyof Omit<MatchPrefRow, "id" | "userId" | "updatedAt">
): boolean {
  const row = map.get(userId);
  if (!row) return true;
  const val = row[key];
  return val !== false;
}

export function bothPrefsEnabled(
  map: Map<string, MatchPrefRow>,
  userId1: string,
  userId2: string,
  key: keyof Omit<MatchPrefRow, "id" | "userId" | "updatedAt">
): boolean {
  return prefEnabled(map, userId1, key) && prefEnabled(map, userId2, key);
}

export async function getActiveClubMembershipKeys(
  userIds: string[],
  clubIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0 || clubIds.length === 0) return new Set();
  const rows = await db
    .select({ userId: motoClubMembers.userId, clubId: motoClubMembers.clubId })
    .from(motoClubMembers)
    .where(and(
      inArray(motoClubMembers.userId, userIds),
      inArray(motoClubMembers.clubId, clubIds),
      eq(motoClubMembers.status, "active"),
    ));
  return new Set(rows.map((r) => `${r.userId}:${r.clubId}`));
}

export function clubScopeAllows(
  p1: Proposal,
  p2: Proposal,
  membershipKeys: Set<string>,
): boolean {
  const c1 = p1.clubId ?? null;
  const c2 = p2.clubId ?? null;
  if (c1 === null && c2 === null) return true;
  if (c1 !== c2) return false;
  return membershipKeys.has(`${p1.userId}:${c1}`) && membershipKeys.has(`${p2.userId}:${c2}`);
}

export function timeRangesOverlap(from1: Date | null, to1: Date | null, from2: Date | null, to2: Date | null): boolean {
  if (!from1 || !to1 || !from2 || !to2) return true;
  const f1 = new Date(from1).getTime();
  const t1 = new Date(to1).getTime();
  const f2 = new Date(from2).getTime();
  const t2 = new Date(to2).getTime();
  return f1 <= t2 && f2 <= t1;
}

export function sameDay(d1: Date | null, d2: Date | null): boolean {
  if (!d1 || !d2) return true;
  const a = new Date(d1);
  const b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export const MATCH_RULES: MatchRule[] = [
  { searchType1: "find_a_friend", searchType2: "find_a_friend" },
  { searchType1: "find_a_guest", searchType2: "find_a_biker" },
  { searchType1: "hitcher", searchType2: "hitchhiker" },
  { searchType1: "find_a_guest", searchType2: "hitchhiker" },
  { searchType1: "hitcher", searchType2: "find_a_biker" },
];
