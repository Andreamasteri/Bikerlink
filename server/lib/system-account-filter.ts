import { notInArray } from "drizzle-orm";
import { PROTECTED_NICKNAMES } from "../constants";
import { users } from "@shared/db";

/**
 * Task #1236: JS-level system-account predicate.
 * Returns true if the given user is a system account that should be hidden
 * from all public-facing surfaces (admin role OR protected nickname).
 * Moderators (role="moderator") are intentionally NOT system accounts.
 *
 * Use this for result-time filtering (JS arrays, tracker guards, null-checks).
 * For SQL WHERE clauses use systemAccountConditions() below.
 */
export function isSystemAccount(u: { role?: string | null; nickname?: string | null }): boolean {
  return u.role === "admin" || PROTECTED_NICKNAMES.includes(u.nickname ?? "");
}

/**
 * Task #1236: SQL system-account filter.
 * Returns two Drizzle conditions that hide admin accounts and all protected
 * nicknames (e.g. BikerLink_Official) from public-facing queries.
 * Moderators (role="moderator") are intentionally NOT excluded.
 *
 * Usage:
 *   .where(and(...systemAccountConditions(users), ...otherConditions))
 *
 * In dynamic-import route handlers pass the locally imported table:
 *   const { users: usersTable } = await import("@shared/db");
 *   .where(and(...systemAccountConditions(usersTable), ...rest))
 */
export function systemAccountConditions(usersTable: typeof users) {
  return [
    notInArray(usersTable.role, ["admin"]),
    notInArray(usersTable.nickname, PROTECTED_NICKNAMES),
  ] as const;
}
