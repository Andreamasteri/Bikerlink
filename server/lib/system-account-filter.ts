import { notInArray } from "drizzle-orm";
import { PROTECTED_NICKNAMES } from "../constants";
import { users } from "@shared/schema";

/**
 * Task #1236: system-account SQL filter.
 * Returns two Drizzle conditions that hide admin accounts and all protected nicknames
 * (e.g. BikerLink_Official) from public-facing queries.
 * Moderators (role="moderator") are intentionally NOT excluded.
 *
 * Usage:
 *   .where(and(...systemAccountConditions(users), ...otherConditions))
 *
 * For dynamic-import contexts (inline queries), spread directly:
 *   const { notInArray } = await import("drizzle-orm");
 *   notInArray(usersTable.role, ["admin"]), notInArray(usersTable.nickname, PROTECTED_NICKNAMES)
 */
export function systemAccountConditions(usersTable: typeof users) {
  return [
    notInArray(usersTable.role, ["admin"]),
    notInArray(usersTable.nickname, PROTECTED_NICKNAMES),
  ] as const;
}
