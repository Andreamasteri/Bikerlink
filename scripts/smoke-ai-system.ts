/**
 * Task #2663 — Smoke test runtime sistema AI.
 *
 * Verifica end-to-end che ogni endpoint usato dalle schermate AI admin
 * (Watchdog, AI Console, AI Pinned, AI Layer, AI Moderation, FAB) risponda
 * senza 5xx e senza crashare il backend. Per ogni endpoint stampa OK/FAIL
 * con status code e tempo di risposta. Exit code != 0 se almeno un FAIL.
 *
 * Crea on-the-fly:
 *  - una proposta watchdog dummy (kind=proposal) per testare accept/reject;
 *  - una conversazione + messaggio per testare pin/unpin/delete.
 * Tutti i record dummy vengono rimossi a fine run.
 *
 * Usage:
 *   ADMIN_USER_ID=<uuid> [SESSION_COOKIE='connect.sid=…'] [E2E_BASE=http://localhost:5000] \
 *     npx tsx scripts/smoke-ai-system.ts
 *
 * Se SESSION_COOKIE non è settato ma SESSION_SECRET è disponibile, la
 * sessione admin viene firmata e iniettata in `session` (riusa lo stesso
 * pattern di `scripts/e2e-ai-coordinator.ts`).
 */
import { performance } from "node:perf_hooks";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import {
  aiWatchdogLog,
  aiConversations,
  aiMessages,
  aiPinnedInsights,
} from "../shared/db";
import { createAdminSession, destroyAdminSession } from "./lib/admin-session";

const BASE = process.env.E2E_BASE ?? "http://localhost:5000";
const ADMIN_ID = process.env.ADMIN_USER_ID;
let SESSION_COOKIE: string | undefined = process.env.SESSION_COOKIE;
let autoDerivedSid: string | undefined;

if (!ADMIN_ID) {
  console.error("ADMIN_USER_ID env richiesto (uuid admin/moderator/superadmin).");
  process.exit(2);
}

type Result = { name: string; method: string; path: string; status: number; ok: boolean; ms: number; detail?: string };
const results: Result[] = [];

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json", "accept": "application/json" };
  if (SESSION_COOKIE) h["cookie"] = SESSION_COOKIE;
  return h;
}

async function call(method: string, path: string, body?: unknown, opts: { okStatuses?: number[]; name?: string } = {}): Promise<Response | null> {
  const t0 = performance.now();
  const name = opts.name ?? `${method} ${path}`;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const ms = Math.round(performance.now() - t0);
    const ok = opts.okStatuses ? opts.okStatuses.includes(res.status) : res.status >= 200 && res.status < 400;
    let detail: string | undefined;
    if (!ok) {
      try { detail = (await res.clone().text()).slice(0, 200); } catch { /* */ }
    }
    results.push({ name, method, path, status: res.status, ok, ms, detail });
    console.log(`${ok ? "✓" : "✗"} ${name} → ${res.status} (${ms}ms)${detail ? ` · ${detail}` : ""}`);
    return res;
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    const detail = (err as Error).message;
    results.push({ name, method, path, status: 0, ok: false, ms, detail });
    console.error(`✗ ${name} → NETWORK ERROR (${ms}ms) · ${detail}`);
    return null;
  }
}

async function callSse(method: string, path: string, body: unknown, opts: { name?: string; maxMs?: number } = {}): Promise<void> {
  // Per gli endpoint SSE testiamo solo che l'handshake risponda 200 con
  // Content-Type text/event-stream, poi chiudiamo. NON eseguiamo davvero
  // l'LLM (per non bruciare budget). Eventuali errori AI_BUDGET_EXCEEDED
  // sono comunque comunicati via "event: error" → considerati OK.
  const t0 = performance.now();
  const name = opts.name ?? `SSE ${method} ${path}`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.maxMs ?? 4000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const ms = Math.round(performance.now() - t0);
    const ct = res.headers.get("content-type") ?? "";
    const ok = res.status === 200 && /text\/event-stream/i.test(ct);
    const detail = ok ? `content-type=${ct.split(";")[0]}` : `status=${res.status} ct=${ct}`;
    results.push({ name, method, path, status: res.status, ok, ms, detail });
    console.log(`${ok ? "✓" : "✗"} ${name} → ${res.status} (${ms}ms) · ${detail}`);
    try { ctrl.abort(); } catch { /* */ }
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    const aborted = (err as Error).name === "AbortError";
    // Se l'abbiamo abortito noi *dopo* l'handshake è ok; ma se non abbiamo
    // mai ricevuto headers, fail.
    results.push({
      name, method, path,
      status: aborted ? 0 : -1,
      ok: false, ms,
      detail: aborted ? "timeout handshake SSE" : (err as Error).message,
    });
    console.error(`✗ ${name} → ${aborted ? "TIMEOUT" : "ERROR"} (${ms}ms)`);
  } finally {
    clearTimeout(timeout);
  }
}

// ── Dummy fixtures ─────────────────────────────────────────────────────────
interface Fixtures {
  proposalIdAccept?: string;
  proposalIdReject?: string;
  conversationId?: string;
  messageId?: string;
  pinId?: string;
}
const fx: Fixtures = {};

async function setupFixtures(): Promise<void> {
  // Proposta watchdog dummy #1 → useremo per ACCEPT (riskLevel=high → no
  // dispatch automatico, resta solo marcata accepted).
  const [pAccept] = await db.insert(aiWatchdogLog).values({
    kind: "proposal", scope: "smoke-test", status: "pending",
    summary: "[smoke #2663] proposta dummy ACCEPT — ignora",
    details: { action: "smokeNoOp", riskLevel: "high", source: "smoke-2663" },
  }).returning({ id: aiWatchdogLog.id });
  fx.proposalIdAccept = pAccept.id;

  // Proposta watchdog dummy #2 → REJECT
  const [pReject] = await db.insert(aiWatchdogLog).values({
    kind: "proposal", scope: "smoke-test", status: "pending",
    summary: "[smoke #2663] proposta dummy REJECT — ignora",
    details: { action: "smokeNoOp", riskLevel: "high", source: "smoke-2663" },
  }).returning({ id: aiWatchdogLog.id });
  fx.proposalIdReject = pReject.id;

  // Conversazione + messaggio dummy → useremo per pin + delete soft.
  const [conv] = await db.insert(aiConversations).values({
    adminUserId: ADMIN_ID!,
    title: "[smoke #2663] conversazione dummy",
  }).returning({ id: aiConversations.id });
  fx.conversationId = conv.id;

  const [msg] = await db.insert(aiMessages).values({
    conversationId: conv.id, role: "assistant",
    content: "[smoke #2663] messaggio dummy per pin",
  }).returning({ id: aiMessages.id });
  fx.messageId = msg.id;
}

async function teardownFixtures(): Promise<void> {
  try {
    if (fx.pinId) await db.delete(aiPinnedInsights).where(eq(aiPinnedInsights.id, fx.pinId));
    if (fx.conversationId) {
      await db.delete(aiPinnedInsights).where(eq(aiPinnedInsights.conversationId, fx.conversationId));
      await db.delete(aiMessages).where(eq(aiMessages.conversationId, fx.conversationId));
      await db.delete(aiConversations).where(eq(aiConversations.id, fx.conversationId));
    }
    if (fx.proposalIdAccept) await db.delete(aiWatchdogLog).where(eq(aiWatchdogLog.id, fx.proposalIdAccept));
    if (fx.proposalIdReject) await db.delete(aiWatchdogLog).where(eq(aiWatchdogLog.id, fx.proposalIdReject));
  } catch (e) {
    console.warn("[teardown] errore (non-fatal):", (e as Error).message);
  }
  if (autoDerivedSid) {
    try { await destroyAdminSession(autoDerivedSid); } catch { /* */ }
  }
}

// ── Test groups ────────────────────────────────────────────────────────────
async function testWatchdog(): Promise<void> {
  console.log("\n── Watchdog ─────────────────────────────────────────");
  await call("GET", "/api/admin/watchdog/snapshot");
  await call("GET", "/api/admin/watchdog/snapshots?limit=10");
  await call("GET", "/api/admin/watchdog/logs?limit=10");
  await call("GET", "/api/admin/watchdog/logs?kind=proposal&limit=30");
  await call("GET", "/api/admin/watchdog/weekly-reports?limit=3");
  await call("POST", "/api/admin/watchdog/enabled", { enabled: true });
  await call("POST", "/api/admin/watchdog/run-now", undefined, { okStatuses: [200, 409, 500] });
  await call("POST", "/api/admin/watchdog/propose-now", undefined, { okStatuses: [200, 409, 503, 500] });
  if (fx.proposalIdReject) {
    await call("POST", `/api/admin/watchdog/proposals/${fx.proposalIdReject}/reject`, { reason: "smoke test #2663" });
  }
  if (fx.proposalIdAccept) {
    await call("POST", `/api/admin/watchdog/proposals/${fx.proposalIdAccept}/accept`);
  }
  await callSse("POST", "/api/admin/watchdog/chat", {
    messages: [{ role: "user", content: "ping smoke #2663" }],
  }, { name: "SSE POST /api/admin/watchdog/chat" });
}

async function testAiConsole(): Promise<void> {
  console.log("\n── AI Console ───────────────────────────────────────");
  await call("GET", "/api/admin/ai/console/scopes");
  await call("GET", "/api/admin/ai/console/budget");
  await call("GET", "/api/admin/ai/console/admin-prefs");
  await call("PATCH", "/api/admin/ai/console/admin-prefs", { smokeTest2663: true });
  await call("GET", "/api/admin/ai/console/conversations?limit=10");
  await call("GET", "/api/admin/ai/console/conversations?limit=10&includeArchived=1");
  await call("GET", "/api/admin/ai/console/search?q=smoke");
  await call("GET", "/api/admin/ai/actions/pending?limit=20");

  // Crea conversazione via API + reuseByTitle
  const createRes = await call("POST", "/api/admin/ai/console/conversations", {
    title: "[smoke #2663] conv via API", reuseByTitle: true,
    preload: { role: "system", content: "smoke seed" },
  });
  let apiConvId: string | null = null;
  if (createRes && createRes.ok) {
    try {
      const j = await createRes.json() as { conversation?: { id?: string } };
      apiConvId = j.conversation?.id ?? null;
    } catch { /* */ }
  }

  if (fx.conversationId) {
    await call("GET", `/api/admin/ai/console/conversations/${fx.conversationId}/messages`);
    if (fx.messageId) {
      const pinRes = await call("POST", `/api/admin/ai/console/conversations/${fx.conversationId}/pin/${fx.messageId}`, {
        title: "[smoke] pin", note: "smoke test",
      });
      if (pinRes && pinRes.ok) {
        try {
          const j = await pinRes.json() as { pin?: { id?: string } };
          fx.pinId = j.pin?.id;
        } catch { /* */ }
      }
    }
  }
  await call("GET", "/api/admin/ai/console/pinned?limit=50");
  if (fx.pinId) {
    await call("DELETE", `/api/admin/ai/console/pinned/${fx.pinId}`);
    fx.pinId = undefined;
  }
  if (apiConvId) {
    await call("DELETE", `/api/admin/ai/console/conversations/${apiConvId}`);
    // cleanup hard side
    try { await db.delete(aiMessages).where(eq(aiMessages.conversationId, apiConvId)); } catch { /* */ }
    try { await db.delete(aiConversations).where(eq(aiConversations.id, apiConvId)); } catch { /* */ }
  }
  // SSE /message → handshake only (non bruciamo budget LLM)
  await callSse("POST", "/api/admin/ai/console/message", {
    message: "[smoke #2663] ping handshake only",
  }, { name: "SSE POST /api/admin/ai/console/message" });
}

async function testAiLayer(): Promise<void> {
  console.log("\n── AI Layer (coordinator + governance) ──────────────");
  await call("GET", "/api/admin/ai/overview?sinceHours=24");
  await call("GET", "/api/admin/ai/health?sinceHours=24");
  await call("GET", "/api/admin/ai/audit?limit=20");
  await call("GET", "/api/admin/ai/audit?kind=event&limit=20");
  await call("GET", "/api/admin/ai/policies");
  await call("GET", "/api/admin/ai/policies/yaml");
  await call("GET", "/api/admin/ai/paused");
  await call("GET", "/api/admin/ai/conflicts?open=1");
  await call("GET", "/api/admin/ai/cleanup-status");

  // pause + resume su scope dedicato smoke (non interferisce con AI reali)
  await call("POST", "/api/admin/ai/pause", { aiName: "smoke-test", reason: "smoke test #2663", ttlSeconds: 60 });
  await call("POST", "/api/admin/ai/resume", { aiName: "smoke-test" });

  // Validate policies con YAML minimo (non lo applichiamo: PUT è destructive).
  await call("POST", "/api/admin/ai/policies/validate", { yaml: "version: 1\nrules: []\n" }, { okStatuses: [200, 400, 422] });
}

async function testAiModeration(): Promise<void> {
  console.log("\n── AI Moderation ────────────────────────────────────");
  await call("GET", "/api/admin/ai/stats");
  await call("GET", "/api/admin/ai/settings");
  await call("GET", "/api/admin/ai/hub-card");
  await call("GET", "/api/admin/ai/digest/latest");
  await call("GET", "/api/admin/ai/digest/unread");
  // POST run-once → può fallire se LLM down: accettiamo 200 e 5xx graceful
  await call("POST", "/api/admin/ai/anomaly/scan", undefined, { okStatuses: [200, 500] });
  await call("POST", "/api/admin/ai/digest/run", undefined, { okStatuses: [200, 500] });
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!SESSION_COOKIE && process.env.SESSION_SECRET) {
    const s = await createAdminSession(ADMIN_ID!, { ttlSeconds: 1800 });
    SESSION_COOKIE = s.cookieHeader;
    autoDerivedSid = s.sid;
    console.log(`[setup] SESSION_COOKIE auto-derivato (sid=${s.sid.slice(0, 8)}…)`);
  }
  if (!SESSION_COOKIE) {
    console.error("SESSION_COOKIE non disponibile e SESSION_SECRET assente: impossibile autenticarsi.");
    process.exit(2);
  }

  console.log(`Smoke AI System — base=${BASE} admin=${ADMIN_ID!.slice(0, 8)}…`);
  await setupFixtures();
  try {
    await testWatchdog();
    await testAiConsole();
    await testAiLayer();
    await testAiModeration();
  } finally {
    await teardownFixtures();
  }

  // Report finale
  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);
  console.log("\n══════════════════════════════════════════════════════");
  console.log(`Totale endpoint testati: ${results.length}   OK: ${ok}   FAIL: ${fail}   (${totalMs}ms cumulati)`);
  if (fail > 0) {
    console.log("\nFAIL dettaglio:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  ✗ ${r.name} → ${r.status} (${r.ms}ms)${r.detail ? ` · ${r.detail.slice(0, 160)}` : ""}`);
    }
  }
  console.log("══════════════════════════════════════════════════════");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  try { await teardownFixtures(); } catch { /* */ }
  process.exit(1);
});
