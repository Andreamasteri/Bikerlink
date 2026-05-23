import { db } from "./db";
import { sql } from "drizzle-orm";

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
