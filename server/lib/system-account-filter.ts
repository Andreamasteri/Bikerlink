import { notInArray, eq } from "drizzle-orm";
import { PROTECTED_NICKNAMES } from "../constants";
import { users } from "@shared/db";

/**
 * Task #1236 / Task #2794: JS-level system-account predicate.
 * Returns true if the given user is a system account that should be hidden
 * from all public-facing surfaces. A user is a system account when:
 *   - the dedicated `isSystem` flag is true (Task #2794), OR
 *   - the role is "admin", OR
 *   - the nickname is in PROTECTED_NICKNAMES (legacy fallback).
 * Moderators (role="moderator") are intentionally NOT system accounts.
 *
 * Use this for result-time filtering (JS arrays, tracker guards, null-checks).
 * For SQL WHERE clauses use systemAccountConditions() below.
 */
export function isSystemAccount(u: { role?: string | null; nickname?: string | null; isSystem?: boolean | null }): boolean {
  return u.isSystem === true || u.role === "admin" || PROTECTED_NICKNAMES.includes(u.nickname ?? "");
}

/**
 * Task #1236 / Task #2794: SQL system-account filter.
 * Returns Drizzle conditions that hide system accounts from public-facing
 * queries. Excludes rows where `isSystem` is true, role is "admin", or the
 * nickname is in PROTECTED_NICKNAMES (legacy fallback).
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
    eq(usersTable.isSystem, false),
    notInArray(usersTable.role, ["admin"]),
    notInArray(usersTable.nickname, PROTECTED_NICKNAMES),
  ] as const;
}
