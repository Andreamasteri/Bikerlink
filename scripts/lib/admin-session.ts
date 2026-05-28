import crypto from "node:crypto";
import signature from "cookie-signature";
import { sql } from "drizzle-orm";
import { db } from "../../server/db";

export interface AdminSessionResult {
  sid: string;
  signedToken: string;
  cookieHeader: string;
  bearer: string;
}

export async function createAdminSession(
  userId: string,
  opts: { sessionType?: "web" | "mobile"; ttlSeconds?: number } = {},
): Promise<AdminSessionResult> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET non settato — impossibile firmare la sessione admin.");
  const ttl = opts.ttlSeconds ?? 3600;
  const sessionType = opts.sessionType ?? "web";
  const sid = crypto.randomBytes(24).toString("hex");
  const sess = {
    cookie: { originalMaxAge: ttl * 1000, expires: new Date(Date.now() + ttl * 1000).toISOString(), httpOnly: true, path: "/" },
    userId,
    sessionType,
  };
  await db.execute(
    sql`INSERT INTO session (sid, sess, expire) VALUES (${sid}, ${JSON.stringify(sess)}::json, NOW() + (${ttl} || ' seconds')::interval)`,
  );
  const signed = `s:${signature.sign(sid, secret)}`;
  const cookieHeader = `connect.sid=${encodeURIComponent(signed)}`;
  return { sid, signedToken: signed, cookieHeader, bearer: signed };
}

export async function destroyAdminSession(sid: string): Promise<void> {
  await db.execute(sql`DELETE FROM session WHERE sid = ${sid}`);
}
