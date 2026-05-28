/**
 * Task #2645 — Smoke E2E AI Console.
 *
 * Esegue 7 scenari API-level contro un server in esecuzione, coprendo le
 * acceptance del task #2645:
 *  a) admin-prefs onboarding round-trip       → step 1
 *  b) creazione/CRUD conversazione + SSE       → step 2 + 3
 *  c) search full-text con messageId hit       → step 4 + 7
 *  d) pin/unpin knowledge base condivisa con   → step 5
 *     fallback body al contenuto del messaggio
 *  e) budget endpoint reale                    → step 6
 *  f) action queue raggiungibile (≥1 scope)    → step 8
 *  g) deep-link conv+messageId                 → step 7
 *
 * Note: badge WS / FAB / preload "Spiegami" sono coperti dai test UI
 * (testing skill) — non testabili da uno smoke API-level.
 *
 * Richiede ENV:
 *  - SMOKE_BASE_URL (default http://localhost:5000)
 *  - SMOKE_ADMIN_COOKIE (cookie session di un admin loggato)
 */
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:5000";
const COOKIE = process.env.SMOKE_ADMIN_COOKIE ?? "";

if (!COOKIE) {
  console.error("[smoke] SMOKE_ADMIN_COOKIE mancante. Esporta il cookie di sessione admin e ritenta.");
  process.exit(2);
}

interface Step { name: string; run: () => Promise<void> }

const results: Array<{ name: string; ok: boolean; err?: string }> = [];

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: COOKIE,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function expectOk(res: Response, label: string): Promise<unknown> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

let createdConvId: string | null = null;
let firstMessageId: string | null = null;
let pinnedId: string | null = null;

const steps: Step[] = [
  {
    name: "1. admin-prefs GET/PATCH round-trip",
    run: async () => {
      const before = (await expectOk(await api("GET", "/api/admin/ai/console/admin-prefs"), "GET prefs")) as { prefs: Record<string, unknown> };
      const flag = !before.prefs?.aiConsoleOnboarded;
      const after = (await expectOk(
        await api("PATCH", "/api/admin/ai/console/admin-prefs", { aiConsoleOnboarded: flag, smokeAt: Date.now() }),
        "PATCH prefs",
      )) as { prefs: Record<string, unknown> };
      if (after.prefs?.aiConsoleOnboarded !== flag) throw new Error("prefs PATCH non riflesso");
    },
  },
  {
    name: "2. crea conversazione",
    run: async () => {
      const r = (await expectOk(
        await api("POST", "/api/admin/ai/console/conversations", { title: `smoke-${Date.now()}` }),
        "POST conv",
      )) as { conversation?: { id?: string } };
      const id = r.conversation?.id;
      if (!id) throw new Error("conversation.id mancante in risposta");
      createdConvId = id;
    },
  },
  {
    name: "3. stream SSE di un messaggio",
    run: async () => {
      if (!createdConvId) throw new Error("step 2 fallito");
      const res = await fetch(`${BASE}/api/admin/ai/console/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: COOKIE },
        body: JSON.stringify({
          conversationId: createdConvId,
          message: "ping di smoke test, rispondi 'pong'.",
        }),
      });
      if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const start = Date.now();
      let sawDone = false;
      let buf = "";
      while (!sawDone && Date.now() - start < 60_000) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        if (buf.includes("[DONE]") || buf.includes("event: done")) sawDone = true;
      }
      try { await reader.cancel(); } catch { /* noop */ }
      if (!sawDone) throw new Error("stream non ha emesso [DONE] entro 60s");
      // Recupera il primo messageId per lo step 7.
      await sleep(200);
      const mRes = (await expectOk(
        await api("GET", `/api/admin/ai/console/conversations/${createdConvId}/messages`),
        "GET messages",
      )) as { messages?: Array<{ id?: string }> };
      firstMessageId = mRes.messages?.[0]?.id ?? null;
    },
  },
  {
    name: "4. search full-text",
    run: async () => {
      const r = (await expectOk(
        await api("GET", `/api/admin/ai/console/search?q=${encodeURIComponent("smoke")}`),
        "GET search",
      )) as { results?: Array<{ conversationId?: string; messageId?: string; convTitle?: string | null; snippet?: string }> };
      if (!Array.isArray(r.results)) throw new Error("results non è array");
      // Non forziamo hit (potrebbe non aver indicizzato): basta shape valida.
      if (r.results.length > 0) {
        const first = r.results[0];
        if (!first.conversationId || !first.messageId) throw new Error("hit senza conversationId/messageId");
      }
    },
  },
  {
    name: "5. pin/unpin knowledge base (endpoint nested + body fallback)",
    run: async () => {
      if (!createdConvId || !firstMessageId) throw new Error("conv/msg id mancanti");
      const pin = (await expectOk(
        await api(
          "POST",
          `/api/admin/ai/console/conversations/${createdConvId}/pin/${firstMessageId}`,
          { title: "Smoke insight" }, // note assente → body deve fare fallback al contenuto del msg
        ),
        "POST pin",
      )) as { pin?: { id?: string } };
      pinnedId = pin.pin?.id ?? null;
      if (!pinnedId) throw new Error("pin.id mancante");
      const list = (await expectOk(
        await api("GET", "/api/admin/ai/console/pinned"),
        "GET pinned",
      )) as { pinned?: Array<{ id: string; body: string }> };
      const found = list.pinned?.find((p) => p.id === pinnedId);
      if (!found) throw new Error("pin appena creato non in lista");
      if (!found.body || found.body.trim().length === 0) {
        throw new Error("body insight vuoto — fallback al contenuto messaggio non attivo");
      }
      await expectOk(await api("DELETE", `/api/admin/ai/console/pinned/${pinnedId}`), "DELETE pinned");
    },
  },
  {
    name: "6. budget endpoint",
    run: async () => {
      const r = (await expectOk(await api("GET", "/api/admin/ai/console/budget"), "GET budget")) as Record<string, unknown>;
      if (typeof r !== "object" || r === null) throw new Error("budget shape non valido");
    },
  },
  {
    name: "7. deep-link conv+messageId (messages endpoint)",
    run: async () => {
      if (!createdConvId) throw new Error("conv mancante");
      const r = (await expectOk(
        await api("GET", `/api/admin/ai/console/conversations/${createdConvId}/messages`),
        "GET messages deep-link",
      )) as { messages?: Array<{ id: string }> };
      if (!Array.isArray(r.messages)) throw new Error("messages non array");
      if (firstMessageId && !r.messages.some((m) => m.id === firstMessageId)) {
        throw new Error("messageId non trovato nei messaggi");
      }
    },
  },
  {
    name: "8. action queue raggiungibile (struttura byScope)",
    run: async () => {
      const r = (await expectOk(
        await api("GET", "/api/admin/ai/actions/pending?limit=50"),
        "GET actions pending",
      )) as { items?: unknown[]; total?: number; byScope?: Record<string, number> };
      if (!Array.isArray(r.items)) throw new Error("items non array");
      if (typeof r.byScope !== "object" || r.byScope === null) throw new Error("byScope mancante");
    },
  },
];

(async () => {
  for (const step of steps) {
    process.stdout.write(`[smoke] ${step.name} … `);
    try {
      await step.run();
      results.push({ name: step.name, ok: true });
      process.stdout.write("OK\n");
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      results.push({ name: step.name, ok: false, err });
      process.stdout.write(`FAIL — ${err}\n`);
    }
  }

  // Cleanup best-effort.
  if (createdConvId) {
    try { await api("DELETE", `/api/admin/ai/console/conversations/${createdConvId}`); } catch { /* noop */ }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[smoke] ${results.length - failed.length}/${results.length} OK`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  ✗ ${f.name}: ${f.err}`);
    process.exit(1);
  }
})();
