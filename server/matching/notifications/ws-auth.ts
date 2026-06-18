import type { IncomingMessage } from "http";
import { db } from "../../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";

/**
 * Validates that the upgrade request belongs to an admin user.
 * Best-effort: parses the session cookie via the same store used by express-session.
 * On any failure returns null (connection rejected).
 */
export async function validateSessionForUpgrade(req: IncomingMessage): Promise<string | null> {
  try {
    const cookieHeader = req.headers.cookie ?? "";
    if (!cookieHeader) return null;

    const sessionUtils = await import("../../session-utils").catch(() => null) as
      | { getUserIdFromCookieHeader?: (cookie: string) => Promise<string | null> }
      | null;
    let userId: string | null = null;
    if (sessionUtils && typeof sessionUtils.getUserIdFromCookieHeader === "function") {
      userId = await sessionUtils.getUserIdFromCookieHeader(cookieHeader);
    }
    if (!userId) return null;

    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!row || row.role !== "admin") return null;
    return userId;
  } catch {
    return null;
  }
}

/**
 * Validates that the upgrade request belongs to any authenticated user (no role check).
 * Used by the diagnostic WS so normal users can also connect and send reports.
 * On any failure returns null (connection rejected).
 */
export async function validateAnyUserForUpgrade(req: IncomingMessage): Promise<string | null> {
  try {
    const cookieHeader = req.headers.cookie ?? "";
    if (!cookieHeader) return null;

    const sessionUtils = await import("../../session-utils").catch(() => null) as
      | { getUserIdFromCookieHeader?: (cookie: string) => Promise<string | null> }
      | null;
    let userId: string | null = null;
    if (sessionUtils && typeof sessionUtils.getUserIdFromCookieHeader === "function") {
      userId = await sessionUtils.getUserIdFromCookieHeader(cookieHeader);
    }
    if (!userId) return null;

    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!row) return null;
    return userId;
  } catch {
    return null;
  }
}
