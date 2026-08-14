#!/usr/bin/env tsx
/**
 * BikerLink — Smoke test automatizzato delle API.
 *
 * Esegue una sequenza di chiamate HTTP contro il backend Express e stampa una
 * tabella PASS / FAIL / SKIP. Esce con codice != 0 **al primo fallimento
 * BLOCKER** (fast-fail). I check non-BLOCKER continuano l'esecuzione anche in
 * caso di fallimento.
 */
import { cleanupOrphanSmokeUsers } from "./cleanup-orphans-runtime.js";
import { runSmokePart2 } from "./run-smoke.part2";

export type Severity = "BLOCKER" | "MAJOR" | "MINOR";
export type Outcome = "PASS" | "FAIL" | "SKIP";
// Smoke test JSON responses are dynamically shaped — intentional any for raw HTTP body.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonBody = any;

export interface CheckResult {
  id: string;
  area: string;
  name: string;
  severity: Severity;
  outcome: Outcome;
  status?: number;
  durationMs: number;
  note?: string;
}

export const BASE_URL = (process.env.BASE_URL ?? "http://localhost:5000").replace(/\/$/, "");
export const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 10_000);
const ALLOW_PROD = process.env.SMOKE_ALLOW_PROD === "1";
export const TS = Date.now();
const SPOOF_IP = process.env.SMOKE_SPOOF_IP ?? `10.${(TS >> 16) & 0xff}.${(TS >> 8) & 0xff}.${TS & 0xff}`;
export const EMAIL = process.env.SMOKE_EMAIL ?? `smoke+${TS}@bikerlink.test`;
export const PASSWORD = process.env.SMOKE_PASSWORD ?? "Smoke1234!";
export const NICKNAME = process.env.SMOKE_NICKNAME ?? `smoke${TS}`;
export const INVITE_CODE = process.env.SMOKE_INVITE_CODE;
export const DATABASE_URL = process.env.DATABASE_URL_CANDIDATE;
export const SMOKE_REGISTRATION_TOKEN = process.env.SMOKE_REGISTRATION_TOKEN;

if (/bikerlink\.(app|com|it)$/i.test(new URL(BASE_URL).hostname) && !ALLOW_PROD) {
  console.error(`[smoke] Rifiuto di eseguire contro produzione (${BASE_URL}). Imposta SMOKE_ALLOW_PROD=1 per forzare.`);
  process.exit(2);
}

export const results: CheckResult[] = [];
export let cookieJar = "";
export let stopReason: string | null = null;
// Stato condiviso con runWithCleanup(): agisce SOLO se questo run ha registrato un utente smoke.
export let registeredThisRun = false;
export let createdUserId: string | null = null;

export function captureCookies(res: Response): void {
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  const setCookies = typeof anyHeaders.getSetCookie === "function" ? anyHeaders.getSetCookie() : [];
  if (setCookies.length === 0) return;
  const merged = new Map<string, string>();
  for (const c of cookieJar.split("; ").filter(Boolean)) {
    const [k, ...rest] = c.split("=");
    if (k) merged.set(k, rest.join("="));
  }
  for (const sc of setCookies) {
    const first = sc.split(";")[0];
    const eq = first.indexOf("=");
    if (eq > 0) merged.set(first.slice(0, eq), first.slice(eq + 1));
  }
  cookieJar = [...merged.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export async function http(
  method: string,
  path: string,
  body?: unknown,
  opts: { accept?: string; raw?: boolean } = {},
): Promise<{ status: number; json: JsonBody; text: string; res: Response }> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: opts.accept ?? "application/json" };
  if (cookieJar) headers.Cookie = cookieJar;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!headers["X-Forwarded-For"]) headers["X-Forwarded-For"] = SPOOF_IP;
  if (SMOKE_REGISTRATION_TOKEN) headers["X-Bikerlink-Smoke-Token"] = SMOKE_REGISTRATION_TOKEN;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
      redirect: "manual",
    });
    captureCookies(res);
    const text = await res.text();
    let json: JsonBody = null;
    if (!opts.raw) {
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    }
    return { status: res.status, json, text, res };
  } finally {
    clearTimeout(timer);
  }
}

export async function run(
  id: string,
  area: string,
  name: string,
  severity: Severity,
  fn: () => Promise<{ ok: boolean; status?: number; note?: string; skip?: boolean }>,
): Promise<CheckResult> {
  if (stopReason) {
    const r: CheckResult = {
      id, area, name, severity, outcome: "SKIP",
      durationMs: 0, note: `interrotto: ${stopReason}`,
    };
    results.push(r);
    console.log(`○ ${id.padEnd(6)} ${area.padEnd(12)} ${name.padEnd(36)} ${"-".padStart(4)} ${"0".padStart(5)}ms  — ${r.note}`);
    return r;
  }
  const t0 = Date.now();
  let outcome: Outcome = "FAIL";
  let status: number | undefined;
  let note: string | undefined;
  try {
    const r = await fn();
    status = r.status;
    note = r.note;
    outcome = r.skip ? "SKIP" : r.ok ? "PASS" : "FAIL";
  } catch (e: unknown) {
    note = e instanceof Error ? e.message : String(e);
    outcome = "FAIL";
  }
  const result: CheckResult = { id, area, name, severity, outcome, status, durationMs: Date.now() - t0, note };
  results.push(result);
  const tag = outcome === "PASS" ? "✓" : outcome === "SKIP" ? "○" : "✗";
  const sev = outcome === "FAIL" ? ` [${severity}]` : "";
  console.log(
    `${tag} ${id.padEnd(6)} ${area.padEnd(12)} ${name.padEnd(36)} ` +
    `${String(status ?? "-").padStart(4)} ${String(result.durationMs).padStart(5)}ms${sev}` +
    (note ? `  — ${note}` : ""),
  );
  if (outcome === "FAIL" && severity === "BLOCKER") {
    stopReason = `BLOCKER fail ${id} ${name}`;
  }
  return result;
}

export const SMOKE_EMAIL_PATTERN = /^smoke\+[^@]+@bikerlink\.test$/i;
export const FORCE_CLEANUP = process.env.SMOKE_FORCE_CLEANUP === "1";

export async function cleanupSmokeUser(
  email: string,
  createdUserIdParam: string | null,
  registeredThisRunParam: boolean,
): Promise<{ ok: boolean; note: string }> {
  if (!DATABASE_URL) return { ok: true, note: "DATABASE_URL non disponibile — skip" };
  if (!registeredThisRunParam && !FORCE_CLEANUP) {
    return { ok: true, note: "skip: register non riuscito in questo run (usa SMOKE_FORCE_CLEANUP=1 per forzare)" };
  }
  if (!SMOKE_EMAIL_PATTERN.test(email)) {
    return { ok: true, note: `skip: email '${email}' non corrisponde al pattern smoke+*@bikerlink.test` };
  }
  let pg: typeof import("pg");
  try { pg = await import("pg"); } catch { return { ok: false, note: "pacchetto pg non disponibile" }; }
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    let userId = createdUserIdParam;
    if (!userId) {
      const u = await client.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND email ILIKE 'smoke+%@bikerlink.test' LIMIT 1",
        [email],
      );
      if (u.rowCount === 0) return { ok: true, note: "nessun utente smoke da rimuovere" };
      userId = u.rows[0].id;
    }
    const verify = await client.query(
      "SELECT email FROM users WHERE id = $1 AND email ILIKE 'smoke+%@bikerlink.test' LIMIT 1",
      [userId],
    );
    if (verify.rowCount === 0) {
      return { ok: false, note: `skip: userId=${userId} non corrisponde a un account smoke` };
    }
    try { await client.query("DELETE FROM email_verification_tokens WHERE user_id = $1", [userId]); } catch { /* tabella opzionale */ }
    try { await client.query("DELETE FROM session WHERE sess ->> 'userId' = $1", [userId]); } catch { /* tabella opzionale */ }
    const del = await client.query("DELETE FROM users WHERE id = $1", [userId]);
    const remaining = await client.query(
      "SELECT 1 FROM users WHERE id = $1 OR LOWER(email) = LOWER($2) LIMIT 1",
      [userId, email],
    );
    const ok = del.rowCount === 1 && remaining.rowCount === 0;
    return { ok, note: `userId=${userId} deleted=${del.rowCount} remaining=${remaining.rowCount}` };
  } catch (e: unknown) {
    return { ok: false, note: `pg error: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

export async function autoVerifyEmail(email: string): Promise<{ ok: boolean; note: string }> {
  if (!DATABASE_URL) return { ok: false, note: "DATABASE_URL non disponibile" };
  let pg: typeof import("pg");
  try { pg = await import("pg"); } catch { return { ok: false, note: "pacchetto pg non disponibile" }; }
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    const u = await client.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [email]);
    if (u.rowCount === 0) return { ok: false, note: "utente non trovato in DB" };
    const userId = u.rows[0].id;
    await client.query("UPDATE users SET email_verified = true WHERE id = $1", [userId]);
    await client.query("DELETE FROM email_verification_tokens WHERE user_id = $1", [userId]);
    return { ok: true, note: `userId=${userId}` };
  } catch (e: unknown) {
    return { ok: false, note: `pg error: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

async function main(): Promise<number> {
  console.log(`\n[smoke] BASE_URL=${BASE_URL}`);
  console.log(`[smoke] email=${EMAIL}\n`);
  await cleanupOrphanSmokeUsers();
  console.log("flag id     area         check                                status   time");
  console.log("-".repeat(96));

  // Parte 1: Auth e discovery base
  await run("1.1", "health", "GET /healthz", "BLOCKER", async () => {
    const r = await http("GET", "/healthz");
    return { ok: r.status === 200, status: r.status };
  });

  await run("12.1", "ota", "GET /api/ota/manifest", "BLOCKER", async () => {
    const r = await http("GET", "/api/ota/manifest");
    return { ok: r.status === 200, status: r.status };
  });

  await run("12.5", "invite", "GET /api/invitations/preview/:code", "MAJOR", async () => {
    if (!INVITE_CODE) return { ok: true, skip: true, note: "SMOKE_INVITE_CODE non impostato" };
    const r = await http("GET", `/api/invitations/preview/${encodeURIComponent(INVITE_CODE)}`);
    return { ok: r.status === 200, status: r.status };
  });

  let registered = false;
  await run("1.2", "auth", "POST /api/auth/register", "BLOCKER", async () => {
    const r = await http("POST", "/api/auth/register", {
      email: EMAIL,
      password: PASSWORD,
      nickname: NICKNAME,
      userType: "biker",
      sex: "M",
      birthYear: 1990,
      country: "IT",
      eulaAccepted: true,
      ...(INVITE_CODE ? { invitationCode: INVITE_CODE } : {}),
    });
    registered = r.status >= 200 && r.status < 300;
    if (registered) {
      registeredThisRun = true;
      const id = r.json?.user?.id ?? r.json?.userId ?? r.json?.id;
      if (typeof id === "string" && id.length > 0) createdUserId = id;
    }
    return { ok: registered, status: r.status, note: registered ? undefined : (r.json?.message ?? r.text?.slice(0, 120)) };
  });

  let verified = false;
  await run("1.6", "auth", "auto-verify email (DB)", "BLOCKER", async () => {
    if (!registered) return { ok: false, note: "register fallito" };
    const v = await autoVerifyEmail(EMAIL);
    verified = v.ok;
    return { ok: v.ok, note: v.note };
  });

  let loggedIn = false;
  await run("1.7", "auth", "POST /api/auth/login", "BLOCKER", async () => {
    if (!verified) return { ok: false, note: "email non verificata" };
    const r = await http("POST", "/api/auth/login", { identifier: EMAIL, password: PASSWORD });
    loggedIn = r.status === 200;
    if (loggedIn) {
      const token: string | undefined = r.json?.sessionToken;
      if (token) {
        const enc = encodeURIComponent(token);
        cookieJar = cookieJar
          ? cookieJar.replace(/connect\.sid=[^;]*/, "").replace(/^;\s*|;\s*$/g, "") + `; connect.sid=${enc}`
          : `connect.sid=${enc}`;
      } else {
        return { ok: false, status: r.status, note: "sessionToken assente in risposta" };
      }
    }
    return { ok: loggedIn, status: r.status, note: loggedIn ? undefined : (r.json?.message ?? r.text?.slice(0, 120)) };
  });

  if (!loggedIn && !stopReason) {
    stopReason = "Login fallito";
  }

  // Passa la palla a Parte 2 per il resto dei test
  const exitCode = await runSmokePart2({
    EMAIL,
    createdUserId,
    registeredThisRun,
    results,
    cookieJar,
    stopReason
  });

  return exitCode;
}

if (require.main === module) {
  main().then(code => process.exit(code)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
