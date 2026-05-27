import { db } from "./db";
import { sql } from "drizzle-orm";
import cookie from "cookie";
import signature from "cookie-signature";

/**
 * Parse the `connect.sid` cookie out of the raw cookie header, validate the
 * signature with SESSION_SECRET, and return the userId stored in the session row.
 * Returns null on any failure.
 */
export async function getUserIdFromCookieHeader(cookieHeader: string): Promise<string | null> {
  try {
    const cookies = cookie.parse(cookieHeader);
    const raw = cookies["connect.sid"];
    if (!raw || !raw.startsWith("s:")) return null;
    const secret = process.env.SESSION_SECRET;
    if (!secret) return null;
    const unsigned = signature.unsign(raw.slice(2), secret);
    if (!unsigned) return null;

    type SessRow = { sess: { userId?: string } | null };
    const r = await db.execute(sql`SELECT sess FROM session WHERE sid = ${unsigned} LIMIT 1`);
    const row = (r.rows as SessRow[])[0];
    const userId = row?.sess?.userId;
    return typeof userId === "string" && userId.length > 0 ? userId : null;
  } catch {
    return null;
  }
}

export async function revokeAllUserSessions(
  userId: string,
  options?: { excludeSid?: string },
): Promise<number> {
  if (!userId) return 0;
  const r = options?.excludeSid
    ? await db.execute(sql`DELETE FROM session WHERE sess->>'userId' = ${userId} AND sid <> ${options.excludeSid}`)
    : await db.execute(sql`DELETE FROM session WHERE sess->>'userId' = ${userId}`);
  return (r.rowCount as number) ?? 0;
}

export async function revokeSessionsByType(
  userId: string,
  sessionType: "mobile" | "web",
  options?: { excludeSid?: string },
): Promise<number> {
  if (!userId) return 0;
  const r = options?.excludeSid
    ? await db.execute(sql`DELETE FROM session WHERE sess->>'userId' = ${userId} AND sess->>'sessionType' = ${sessionType} AND sid <> ${options.excludeSid}`)
    : await db.execute(sql`DELETE FROM session WHERE sess->>'userId' = ${userId} AND sess->>'sessionType' = ${sessionType}`);
  return (r.rowCount as number) ?? 0;
}

export async function getActiveSessionsByUserId(
  userId: string,
): Promise<Array<{ sid: string; sessionType: string | null; expiry: Date | null }>> {
  if (!userId) return [];
  const rows = await db.execute(
    sql`SELECT sid, sess->>'sessionType' AS session_type, expire FROM session WHERE sess->>'userId' = ${userId}`
  );
  type SessionRow = { sid: string; session_type: string | null; expire: string | null };
  return (rows.rows as SessionRow[]).map((r) => ({
    sid: r.sid,
    sessionType: r.session_type ?? null,
    expiry: r.expire ? new Date(r.expire) : null,
  }));
}
