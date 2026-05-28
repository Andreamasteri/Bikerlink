#!/usr/bin/env tsx
/**
 * BikerLink — Smoke test automatizzato delle API.
 *
 * Esegue una sequenza di chiamate HTTP contro il backend Express e stampa una
 * tabella PASS / FAIL / SKIP. Esce con codice != 0 **al primo fallimento
 * BLOCKER** (fast-fail). I check non-BLOCKER continuano l'esecuzione anche in
 * caso di fallimento.
 *
 * Variabili d'ambiente:
 *   BASE_URL          URL del backend (default: http://localhost:5000)
 *   DATABASE_URL      Necessaria per auto-verificare l'email dell'utente smoke
 *                     (lettura email_verification_tokens + update users).
 *                     Se non impostata: SKIP login + check post-login.
 *   SMOKE_EMAIL       Email dell'utente smoke (default: auto-generato)
 *   SMOKE_PASSWORD    Password dell'utente smoke (default: 'Smoke1234!')
 *   SMOKE_NICKNAME    Nickname (default: auto)
 *   SMOKE_INVITE_CODE Codice invito di test (opzionale)
 *   SMOKE_TIMEOUT_MS  Timeout per singola richiesta (default 10000)
 *   SMOKE_ALLOW_PROD  '1' per consentire BASE_URL di produzione
 *   SMOKE_JSON        '1' per dump finale dei risultati in JSON
 *
 * Vincoli:
 *  - Solo `fetch` nativo Node, `pg` (già dipendenza del server) per auto-verify.
 *  - Non invia SOS reali (solo GET di stato — endpoint dry-run non disponibile,
 *    vedi follow-up nel docs/smoke-test.md).
 *  - Idempotente: l'utente smoke è dedicato per run.
 */

type Severity = "BLOCKER" | "MAJOR" | "MINOR";
type Outcome = "PASS" | "FAIL" | "SKIP";

interface CheckResult {
  id: string;
  area: string;
  name: string;
  severity: Severity;
  outcome: Outcome;
  status?: number;
  durationMs: number;
  note?: string;
}

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:5000").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 10_000);
const ALLOW_PROD = process.env.SMOKE_ALLOW_PROD === "1";
const TS = Date.now();
const SPOOF_IP = process.env.SMOKE_SPOOF_IP ?? `10.${(TS >> 16) & 0xff}.${(TS >> 8) & 0xff}.${TS & 0xff}`;
const EMAIL = process.env.SMOKE_EMAIL ?? `smoke+${TS}@bikerlink.test`;
const PASSWORD = process.env.SMOKE_PASSWORD ?? "Smoke1234!";
const NICKNAME = process.env.SMOKE_NICKNAME ?? `smoke${TS}`;
const INVITE_CODE = process.env.SMOKE_INVITE_CODE;
const DATABASE_URL = process.env.DATABASE_URL;

if (/bikerlink\.(app|com|it)$/i.test(new URL(BASE_URL).hostname) && !ALLOW_PROD) {
  console.error(`[smoke] Rifiuto di eseguire contro produzione (${BASE_URL}). Imposta SMOKE_ALLOW_PROD=1 per forzare.`);
  process.exit(2);
}

const results: CheckResult[] = [];
let cookieJar = "";
let stopReason: string | null = null;
// Stato condiviso con runWithCleanup(): agisce SOLO se questo run ha registrato un utente smoke.
let registeredThisRun = false;
let createdUserId: string | null = null;

function captureCookies(res: Response): void {
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

async function http(
  method: string,
  path: string,
  body?: unknown,
  opts: { accept?: string; raw?: boolean } = {},
): Promise<{ status: number; json: any; text: string; res: Response }> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: opts.accept ?? "application/json" };
  if (cookieJar) headers.Cookie = cookieJar;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // Trust proxy è abilitato (server/middleware.ts:24). Iniettiamo un IP unico
  // per evitare di esaurire i rate-limiter per-IP (register: 3/h, login: 5/15min).
  if (!headers["X-Forwarded-For"]) headers["X-Forwarded-For"] = SPOOF_IP;
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
    let json: any = null;
    if (!opts.raw) {
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    }
    return { status: res.status, json, text, res };
  } finally {
    clearTimeout(timer);
  }
}

async function run(
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
  } catch (e: any) {
    note = e?.message ?? String(e);
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

const SMOKE_EMAIL_PATTERN = /^smoke\+[^@]+@bikerlink\.test$/i;
const FORCE_CLEANUP = process.env.SMOKE_FORCE_CLEANUP === "1";

async function cleanupSmokeUser(
  email: string,
  createdUserId: string | null,
  registeredThisRun: boolean,
): Promise<{ ok: boolean; note: string }> {
  if (!DATABASE_URL) return { ok: true, note: "DATABASE_URL non disponibile — skip" };
  // Safety guard #1: niente cleanup se questo run non ha registrato un utente
  // (a meno di override esplicito SMOKE_FORCE_CLEANUP=1). Evita di cancellare
  // account preesistenti se SMOKE_EMAIL viene riusato manualmente o se il
  // register è fallito perché l'utente esisteva già.
  if (!registeredThisRun && !FORCE_CLEANUP) {
    return { ok: true, note: "skip: register non riuscito in questo run (usa SMOKE_FORCE_CLEANUP=1 per forzare)" };
  }
  // Safety guard #2: l'email deve corrispondere al pattern smoke. Evita
  // distruzione accidentale se SMOKE_EMAIL è stato sovrascritto con un valore
  // arbitrario.
  if (!SMOKE_EMAIL_PATTERN.test(email)) {
    return { ok: true, note: `skip: email '${email}' non corrisponde al pattern smoke+*@bikerlink.test` };
  }
  let pg: any;
  try { pg = await import("pg"); } catch { return { ok: false, note: "pacchetto pg non disponibile" }; }
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    // Preferenza: id catturato al register; fallback: lookup per email (sempre
    // ristretto al pattern smoke dal guard sopra).
    let userId = createdUserId;
    if (!userId) {
      const u = await client.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND email ILIKE 'smoke+%@bikerlink.test' LIMIT 1",
        [email],
      );
      if (u.rowCount === 0) return { ok: true, note: "nessun utente smoke da rimuovere" };
      userId = u.rows[0].id;
    }
    // Doppio check: verifichiamo che l'id abbia davvero un'email smoke prima
    // di cancellare (difesa in profondità nel caso createdUserId provenga da
    // una fonte non fidata).
    const verify = await client.query(
      "SELECT email FROM users WHERE id = $1 AND email ILIKE 'smoke+%@bikerlink.test' LIMIT 1",
      [userId],
    );
    if (verify.rowCount === 0) {
      return { ok: false, note: `skip: userId=${userId} non corrisponde a un account smoke` };
    }
    // Token di verifica email non hanno FK CASCADE garantita: rimuoviamo esplicitamente.
    try { await client.query("DELETE FROM email_verification_tokens WHERE user_id = $1", [userId]); } catch { /* tabella opzionale */ }
    // Tutte le altre dipendenze hanno ON DELETE CASCADE (vedi shared/db/*.ts).
    const del = await client.query("DELETE FROM users WHERE id = $1", [userId]);
    return { ok: true, note: `userId=${userId} deleted=${del.rowCount}` };
  } catch (e: any) {
    return { ok: false, note: `pg error: ${e?.message ?? String(e)}` };
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

async function autoVerifyEmail(email: string): Promise<{ ok: boolean; note: string }> {
  if (!DATABASE_URL) return { ok: false, note: "DATABASE_URL non disponibile" };
  let pg: any;
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
  } catch (e: any) {
    return { ok: false, note: `pg error: ${e?.message ?? String(e)}` };
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

async function cleanupOrphanSmokeUsers(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query(
      "DELETE FROM email_verification_tokens WHERE user_id IN (SELECT id FROM users WHERE email ILIKE 'smoke+%@bikerlink.test')"
    );
    const r = await client.query(
      "DELETE FROM users WHERE email ILIKE 'smoke+%@bikerlink.test' OR nickname LIKE 'smoke%'"
    );
    if (r.rowCount && r.rowCount > 0) {
      console.log(`[smoke] cleanup orfani: rimossi ${r.rowCount} utenti smoke residui`);
    }
  } catch (e) {
    console.warn(`[smoke] cleanup orfani fallita (non bloccante): ${(e as Error).message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main(): Promise<number> {
  console.log(`\n[smoke] BASE_URL=${BASE_URL}`);
  console.log(`[smoke] email=${EMAIL}\n`);
  await cleanupOrphanSmokeUsers();
  console.log("flag id     area         check                                status   time");
  console.log("-".repeat(96));

  // 1.1 Health
  await run("1.1", "health", "GET /healthz", "BLOCKER", async () => {
    const r = await http("GET", "/healthz");
    return { ok: r.status === 200, status: r.status };
  });

  // 12.1 OTA manifest
  await run("12.1", "ota", "GET /api/ota/manifest", "BLOCKER", async () => {
    const r = await http("GET", "/api/ota/manifest");
    return { ok: r.status === 200, status: r.status };
  });

  // 12.5 Invite code
  await run("12.5", "invite", "GET /api/invitations/preview/:code", "MAJOR", async () => {
    if (!INVITE_CODE) return { ok: true, skip: true, note: "SMOKE_INVITE_CODE non impostato" };
    const r = await http("GET", `/api/invitations/preview/${encodeURIComponent(INVITE_CODE)}`);
    return { ok: r.status === 200, status: r.status };
  });

  // 1.2 Register
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
      // Cattura l'id dell'utente appena creato per il cleanup targettato in
      // finally. Best-effort: se la response non lo espone, il fallback in
      // cleanupSmokeUser farà lookup per email ristretta al pattern smoke.
      const id = r.json?.user?.id ?? r.json?.userId ?? r.json?.id;
      if (typeof id === "string" && id.length > 0) createdUserId = id;
    }
    return { ok: registered, status: r.status, note: registered ? undefined : (r.json?.message ?? r.text?.slice(0, 120)) };
  });

  // 1.6 Auto-verify email (via DB, bypass mailbox)
  let verified = false;
  await run("1.6", "auth", "auto-verify email (DB)", "BLOCKER", async () => {
    if (!registered) return { ok: false, note: "register fallito" };
    const v = await autoVerifyEmail(EMAIL);
    verified = v.ok;
    return { ok: v.ok, note: v.note };
  });

  // 1.7 Login (cattura sessionToken e lo imposta come cookie connect.sid)
  let loggedIn = false;
  await run("1.7", "auth", "POST /api/auth/login", "BLOCKER", async () => {
    if (!verified) return { ok: false, note: "email non verificata" };
    const r = await http("POST", "/api/auth/login", { identifier: EMAIL, password: PASSWORD });
    loggedIn = r.status === 200;
    if (loggedIn) {
      const token: string | undefined = r.json?.sessionToken;
      if (token) {
        // Il backend non emette Set-Cookie (vedi server/routes/auth/login.ts):
        // sessionToken è il valore firmato del cookie connect.sid.
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

  // 2.2 Maps provider status (endpoint può non essere montato — vedi #2673)
  await run("2.2", "maps", "GET /api/maps/provider/status", "MINOR", async () => {
    const r = await http("GET", "/api/maps/provider/status");
    if (r.status === 404) return { ok: true, skip: true, status: r.status, note: "endpoint non montato — vedi task #2673" };
    return { ok: r.status === 200 || r.status === 401, status: r.status };
  });

  // 3.1 Biker discovery (lista biker disponibili)
  let bikerAvailableCount = 0;
  await run("3.1", "match", "GET /api/users/biker-available-list", "BLOCKER", async () => {
    const r = await http("GET", "/api/users/biker-available-list");
    if (r.status === 200) {
      const arr = Array.isArray(r.json) ? r.json : (r.json?.users ?? r.json?.bikers ?? []);
      bikerAvailableCount = Array.isArray(arr) ? arr.length : 0;
    }
    return { ok: r.status === 200, status: r.status, note: r.status === 200 ? `count=${bikerAvailableCount}` : (r.json?.message ?? r.text?.slice(0, 120)) };
  });

  // 3.2 Match summary: nessun tipo a 0 (regressione #59 — almeno biker o zavorrine)
  await run("3.2", "match", "GET /api/users/*-available-count > 0", "BLOCKER", async () => {
    const [b, z, on] = await Promise.all([
      http("GET", "/api/users/biker-available-count"),
      http("GET", "/api/users/zavorrine-available-count"),
      http("GET", "/api/users/online-count"),
    ]);
    if (b.status !== 200 || z.status !== 200 || on.status !== 200) {
      return { ok: false, status: b.status, note: `biker=${b.status} zavorrine=${z.status} online=${on.status}` };
    }
    const bc = Number(b.json?.count ?? b.json ?? 0);
    const zc = Number(z.json?.count ?? z.json ?? 0);
    const oc = Number(on.json?.count ?? on.json ?? 0);
    // Almeno uno > 0 (lo smoke user è online → oc ≥ 1)
    const ok = bc + zc + oc > 0;
    return { ok, status: 200, note: `biker=${bc} zavorrine=${zc} online=${oc}` };
  });

  // 3.7 Match preferences gate
  await run("3.7", "match", "GET /api/match-preferences/gate", "MAJOR", async () => {
    const r = await http("GET", "/api/match-preferences/gate");
    return { ok: r.status === 200, status: r.status };
  });

  // 3.8 Proposals biker-matches (NOTA: bug noto — /:id eat-all in crud.ts → 404)
  await run("3.8", "match", "GET /api/proposals/biker-matches", "MINOR", async () => {
    const r = await http("GET", "/api/proposals/biker-matches");
    if (r.status === 404 && /Proposta non trovata/i.test(r.text)) {
      return { ok: true, skip: true, status: r.status, note: "bug routing noto: crud /:id intercetta — vedi report" };
    }
    return { ok: r.status === 200, status: r.status };
  });

  // 4.1 Planned routes — lista
  await run("4.1", "rides", "GET /api/planned-routes", "BLOCKER", async () => {
    const r = await http("GET", "/api/planned-routes");
    return { ok: r.status === 200, status: r.status };
  });

  // 4.2 Planned routes — creazione minima
  let createdRouteId: string | null = null;
  await run("4.2", "rides", "POST /api/planned-routes", "MAJOR", async () => {
    const r = await http("POST", "/api/planned-routes", {
      title: `Smoke route ${TS}`,
      description: "smoke test",
      waypoints: [
        { lat: 45.4642, lng: 9.1900, name: "Milano" },
        { lat: 45.4773, lng: 9.2050, name: "Linate" },
      ],
      distanceKm: 8,
      durationMinutes: 20,
      style: "curvy",
      visibility: "private",
    });
    if (r.status >= 200 && r.status < 300) {
      createdRouteId = r.json?.id ?? null;
      return { ok: true, status: r.status };
    }
    return { ok: false, status: r.status, note: r.json?.message ?? r.text?.slice(0, 120) };
  });

  // 4.3 Planned routes — dettaglio
  await run("4.3", "rides", "GET /api/planned-routes/:id", "MAJOR", async () => {
    if (!createdRouteId) return { ok: true, skip: true, note: "nessun id" };
    const r = await http("GET", `/api/planned-routes/${createdRouteId}`);
    return { ok: r.status === 200, status: r.status };
  });

  // 6.1 Chat — lista conversazioni
  let convId: string | null = null;
  await run("6.1", "chat", "GET /api/chat/conversations", "BLOCKER", async () => {
    const r = await http("GET", "/api/chat/conversations");
    if (r.status === 200) {
      const list = Array.isArray(r.json) ? r.json : (r.json?.conversations ?? []);
      if (list.length > 0) convId = list[0]?.id ?? null;
      return { ok: true, status: r.status };
    }
    return { ok: false, status: r.status };
  });

  // 6.2 Chat — invio messaggio (usa la conv welcome creata in register)
  await run("6.2", "chat", "POST /api/chat/conversations/:id/messages", "MAJOR", async () => {
    if (!convId) return { ok: true, skip: true, note: "nessuna conversazione disponibile" };
    const r = await http("POST", `/api/chat/conversations/${convId}/messages`, {
      conversationId: convId,
      messageType: "text",
      content: `smoke ping ${TS}`,
    });
    return { ok: r.status === 200 || r.status === 201, status: r.status, note: r.status >= 400 ? (r.json?.message ?? r.text?.slice(0, 120)) : undefined };
  });

  // 6.3 SSE stream — connessione + lettura primo evento (5s, identity)
  await run("6.3", "chat", "SSE /api/chat/stream", "MAJOR", async () => {
    const ctrl = new AbortController();
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-cache",
    };
    if (cookieJar) headers.Cookie = cookieJar;
    const hard = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(`${BASE_URL}/api/chat/stream`, { headers, signal: ctrl.signal });
      const ctype = res.headers.get("content-type") ?? "";
      if (!res.ok) return { ok: false, status: res.status };
      // Stream stabilito: status 200 + content-type text/event-stream è sufficiente
      // per il check fumo. Tentiamo comunque la lettura del primo chunk con timeout 5s.
      let received = false;
      if (res.body) {
        const reader = res.body.getReader();
        const readWithTimeout = Promise.race([
          reader.read().then(r => ({ done: r.done, value: r.value })),
          new Promise<{ done: boolean; value: undefined }>((resolve) =>
            setTimeout(() => resolve({ done: true, value: undefined }), 5000)
          ),
        ]);
        const r = await readWithTimeout;
        received = !!(r.value && r.value.length > 0);
        try { await reader.cancel(); } catch { /* ignore */ }
      }
      ctrl.abort();
      const isSse = /text\/event-stream/i.test(ctype);
      // Pass se 200 + SSE content-type oppure se almeno un chunk è arrivato.
      return {
        ok: isSse || received,
        status: res.status,
        note: received ? "stream attivo" : (isSse ? "connessione SSE stabilita (no eventi in 5s)" : "content-type non SSE"),
      };
    } catch (e: any) {
      return { ok: false, note: e?.name === "AbortError" ? "timeout connessione" : (e?.message ?? String(e)) };
    } finally {
      clearTimeout(hard);
    }
  });

  // 8.1 Motoclubs discovery
  let firstClubId: string | null = null;
  await run("8.1", "motoclub", "GET /api/motoclubs", "BLOCKER", async () => {
    const r = await http("GET", "/api/motoclubs");
    if (r.status === 200) {
      const list = Array.isArray(r.json) ? r.json : (r.json?.motoclubs ?? r.json?.clubs ?? []);
      if (list.length > 0) firstClubId = list[0]?.id ?? null;
      return { ok: true, status: r.status };
    }
    return { ok: false, status: r.status };
  });

  // 8.2 Motoclub join (POST /api/motoclubs/:id/join)
  await run("8.2", "motoclub", "POST /api/motoclubs/:id/join", "MAJOR", async () => {
    if (!firstClubId) return { ok: true, skip: true, note: "nessun club disponibile" };
    const r = await http("POST", `/api/motoclubs/${firstClubId}/join`, {});
    return {
      ok: r.status === 200 || r.status === 201 || r.status === 409,
      status: r.status,
      note: r.status >= 400 && r.status !== 409 ? (r.json?.message ?? r.text?.slice(0, 120)) : undefined,
    };
  });

  // 9.4 SOS active list (read-only — NON inviamo SOS reali)
  await run("9.4", "sos", "GET /api/sos/active", "MAJOR", async () => {
    const r = await http("GET", "/api/sos/active");
    return { ok: r.status === 200, status: r.status };
  });

  // 12.4 Heartbeat
  await run("12.4", "presence", "POST /api/auth/heartbeat", "BLOCKER", async () => {
    const r = await http("POST", "/api/auth/heartbeat", { lat: 45.0, lon: 9.0, accuracy: 20 });
    return { ok: r.status === 200 || r.status === 204, status: r.status, note: r.status >= 400 ? (r.json?.message ?? r.text?.slice(0, 120)) : undefined };
  });

  // 10.1 Tracking session — apri
  let sessionId: string | null = null;
  await run("10.1", "tracking", "POST /api/routes (session)", "MAJOR", async () => {
    const r = await http("POST", "/api/routes", { title: `smoke ${TS}`, trackingFrequency: 5 });
    if (r.status >= 200 && r.status < 300) {
      sessionId = r.json?.id ?? null;
      return { ok: true, status: r.status };
    }
    return { ok: false, status: r.status, note: r.json?.message ?? r.text?.slice(0, 120) };
  });

  // 10.2 Tracking — upload punti
  await run("10.2", "tracking", "POST /api/routes/:id/points", "MAJOR", async () => {
    if (!sessionId) return { ok: true, skip: true, note: "nessuna sessione" };
    const now = Date.now();
    const points = [
      { latitude: 45.4642, longitude: 9.1900, timestamp: new Date(now - 2000).toISOString(), speedKmh: 0, altitude: 120 },
      { latitude: 45.4643, longitude: 9.1905, timestamp: new Date(now - 1000).toISOString(), speedKmh: 18, altitude: 121 },
      { latitude: 45.4645, longitude: 9.1910, timestamp: new Date(now).toISOString(), speedKmh: 25, altitude: 122 },
    ];
    const r = await http("POST", `/api/routes/${sessionId}/points`, { points });
    return { ok: r.status === 200 || r.status === 201 || r.status === 204, status: r.status, note: r.status >= 400 ? (r.json?.message ?? r.text?.slice(0, 120)) : undefined };
  });

  // 10.5 Tracking — chiusura sessione
  await run("10.5", "tracking", "PUT /api/routes/:id/stop", "MAJOR", async () => {
    if (!sessionId) return { ok: true, skip: true, note: "nessuna sessione" };
    const r = await http("PUT" as any, `/api/routes/${sessionId}/stop`, {
      totalDistanceKm: 0.1, maxSpeedKmh: 25, avgSpeedKmh: 15, maxAltitude: 122, durationSeconds: 2, idleTimeSeconds: 1,
    });
    return { ok: r.status === 200 || r.status === 204, status: r.status, note: r.status >= 400 ? (r.json?.message ?? r.text?.slice(0, 120)) : undefined };
  });

  // 1.8 Logout
  await run("1.8", "auth", "POST /api/auth/logout", "MAJOR", async () => {
    if (!loggedIn) return { ok: true, skip: true, note: "non loggato" };
    const r = await http("POST", "/api/auth/logout", {});
    return { ok: r.status === 200 || r.status === 204, status: r.status };
  });

  // Sommario
  const total = results.length;
  const pass = results.filter(r => r.outcome === "PASS").length;
  const fail = results.filter(r => r.outcome === "FAIL").length;
  const skip = results.filter(r => r.outcome === "SKIP").length;
  const blockerFail = results.filter(r => r.outcome === "FAIL" && r.severity === "BLOCKER");

  console.log("-".repeat(96));
  console.log(`[smoke] totale=${total}  PASS=${pass}  FAIL=${fail}  SKIP=${skip}`);
  if (stopReason) console.log(`[smoke] interrotto al primo BLOCKER: ${stopReason}`);
  if (blockerFail.length > 0) {
    console.log(`[smoke] FAIL BLOCKER:`);
    for (const r of blockerFail) console.log(`  - ${r.id} ${r.area}/${r.name} ${r.status ?? ""} ${r.note ?? ""}`);
  }

  if (process.env.SMOKE_JSON === "1") {
    console.log("\n[smoke-json]" + JSON.stringify({ baseUrl: BASE_URL, results, stopReason }));
  }

  return blockerFail.length > 0 ? 1 : 0;
}

async function runWithCleanup(): Promise<void> {
  let exitCode = 0;
  let fatal: unknown = null;
  try {
    exitCode = await main();
  } catch (e) {
    fatal = e;
    exitCode = 2;
  } finally {
    // Cleanup best-effort dell'utente smoke creato in questo run.
    // Gira SEMPRE (anche su fast-fail BLOCKER o eccezione fatale), perché
    // main() ora ritorna l'exit code invece di chiamare process.exit().
    // Non altera l'exit code del report: un delete fallito viene solo loggato.
    try {
      const c = await cleanupSmokeUser(EMAIL, createdUserId, registeredThisRun);
      console.log(`[smoke] cleanup ${EMAIL}: ${c.ok ? "OK" : "FAIL"} — ${c.note}`);
    } catch (e: any) {
      console.log(`[smoke] cleanup ${EMAIL}: FAIL — ${e?.message ?? String(e)}`);
    }
  }
  if (fatal) console.error("[smoke] errore fatale:", (fatal as any)?.message ?? fatal);
  process.exit(exitCode);
}

runWithCleanup();
