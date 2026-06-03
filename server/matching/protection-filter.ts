// Task #3100 — Shared protection filter for matching pipelines.
//
// All run-*.ts matchers MUST import PROTECTED_NICKNAMES from here
// (not from ../constants directly) so that the static import guard test
// in server/__tests__/matching-protection-coverage.test.ts enforces coverage.
import { PROTECTED_NICKNAMES } from "../constants";

export { PROTECTED_NICKNAMES };

/**
 * Returns the SQL raw ARRAY literal string for use in `<> ALL(...)` clauses.
 *
 * Usage (inside a drizzle sql`` template):
 *   WHERE u.nickname <> ALL(${sql.raw(protectedNicknamesSqlArray())})
 */
export function protectedNicknamesSqlArray(): string {
  return `ARRAY['${PROTECTED_NICKNAMES.join("','")}']`;
}

/**
 * JS-level belt-and-suspenders filter.
 * Removes any candidate whose `nickname` field is in PROTECTED_NICKNAMES.
 * Use after SQL-level filtering when candidates are already in memory.
 */
export function filterProtectedAccounts<T extends { nickname: string }>(
  candidates: T[],
): T[] {
  const protectedSet = new Set(PROTECTED_NICKNAMES);
  return candidates.filter((c) => !protectedSet.has(c.nickname));
}
