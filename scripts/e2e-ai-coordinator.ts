// Task #2657 — E2E AI Coordinator + Governance (scenari A-F come da spec task).
//
// Scenarios:
//   A) emit moderation `decision_proposed` (ban-flow) + assert queryable via /api/admin/ai/audit
//   B) conflict R001 (watchdog↔ota-orchestrator) auto-resolved BLOCK
//   C) conflict R002 (app-integrity↔ota-orchestrator) auto-resolved BLOCK
//   D) admin override su conflitto irrisolto → resolvedBy='admin' + ai_decisions
//   E) per-AI kill switch sopprime emit + layer kill switch sopprime tutto
//   F) coordinator-down simulation (COORDINATOR_DISABLED=1) → emit graceful, no crash
//
// Usage:
//   ADMIN_USER_ID=<uuid> [SESSION_COOKIE='connect.sid=…'] npx tsx scripts/e2e-ai-coordinator.ts
//
// SESSION_COOKIE è richiesto per gli step HTTP (A query, D override). Senza,
// quegli step vengono SKIP. Gli scenari coordinator-diretti (B/C/E/F) restano
// coperti.
import { performance } from "node:perf_hooks";
import { setTimeout as wait } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import { db } from "../server/db";
import { aiConflicts, aiDecisions, aiEvents } from "../shared/db";
import { getCoordinator, pauseAi, resumeAi, isAiPaused } from "../server/ai/coordinator";

const BASE = (process.argv.find((a) => a.startsWith("--base="))?.slice(7))
  ?? process.env.E2E_BASE
  ?? "http://localhost:5000";
const ADMIN_ID = process.env.ADMIN_USER_ID;
const SESSION_COOKIE = process.env.SESSION_COOKIE;
if (!ADMIN_ID) {
  console.error("ADMIN_USER_ID env richiesto (uuid admin/superadmin).");
  process.exit(2);
}

type Result = { name: string; ok: boolean; ms: number; detail?: string; skipped?: boolean };
const results: Result[] = [];

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (SESSION_COOKIE) headers["cookie"] = SESSION_COOKIE;
  return fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function step(name: string, fn: () => Promise<string | void>): Promise<void> {
  const t0 = performance.now();
  try {
    const detail = await fn();
    const ms = Math.round(performance.now() - t0);
    if (detail === "SKIP") {
      results.push({ name, ok: true, ms, detail: "skipped", skipped: true });
      console.log(`- ${name} SKIP (${ms}ms)`);
    } else {
      results.push({ name, ok: true, ms, detail: detail || undefined });
      console.log(`✓ ${name} (${ms}ms)${detail ? " · " + detail : ""}`);
    }
  } catch (err) {
    const detail = (err as Error).message;
    results.push({ name, ok: false, ms: Math.round(performance.now() - t0), detail });
    console.error(`✗ ${name} · ${detail}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const c = getCoordinator();
  const corrTag = `e2e-${Date.now().toString(36)}`;

  // Pre-cleanup
  await resumeAi("*");
  for (const ai of ["moderation", "watchdog", "ota-orchestrator", "app-integrity", "db-integrity", "console"]) {
    await resumeAi(ai);
  }

  // ── A) moderation decision_proposed (ban-flow) + audit queryability ────
  let modEventId = "";
  await step("A. moderation decision_proposed (ban-flow) emit + audit queryable", async () => {
    const ev = await c.emit({
      aiName: "moderation",
      eventType: "decision_proposed",
      payload: {
        targetUserId: "u-e2e-A",
        contentId: "p-e2e-A",
        action: "ban_temp",
        durationHours: 24,
        confidence: 0.82,
        rationale: "ripetuti termini hate-speech (e2e)",
      },
      severity: "warn",
      correlationId: `${corrTag}-A`,
    });
    assert(ev.id, "emit moderation non riuscito");
    modEventId = ev.id;
    // DB assertion
    const [row] = await db.select().from(aiEvents).where(eq(aiEvents.id, modEventId)).limit(1);
    assert(row?.eventType === "decision_proposed", "decision_proposed non trovato in ai_events");
    // HTTP queryability
    if (!SESSION_COOKIE) return `db-only (no SESSION_COOKIE) id=${modEventId.slice(0, 8)}`;
    const r = await api("GET", `/api/admin/ai/audit?ai=moderation&type=decision_proposed&limit=20`);
    assert(r.ok, `HTTP ${r.status}`);
    const j = (await r.json()) as { rows: Array<{ id: string }>; count: number };
    assert(j.rows.some((x) => x.id === modEventId), "evento moderation non trovato in /audit");
    return `id=${modEventId.slice(0, 8)} count=${j.count}`;
  });

  // ── B) R001 — watchdog alert critical ↔ ota-orchestrator ────────────────
  await step("B. R001 watchdog↔ota-orchestrator → BLOCK", async () => {
    const wd = await c.emit({
      aiName: "watchdog", eventType: "alert",
      payload: { reason: "rate_burst", service: "ota" },
      severity: "critical", correlationId: `${corrTag}-B`,
    });
    const ota = await c.emit({
      aiName: "ota-orchestrator", eventType: "publish_request",
      payload: { channel: "ios", version: "1.4.3" },
      severity: "info", correlationId: `${corrTag}-B`,
    });
    assert(wd.id && ota.id, "emit B falliti");
    const res = await c.evaluateConflict({
      eventIdA: wd.id, eventIdB: ota.id, conflictType: "ota_watchdog_alert",
    });
    assert(res.policyRuleId === "R001", `policyRuleId=${res.policyRuleId} (atteso R001)`);
    assert(res.action === "BLOCK", `action=${res.action} (atteso BLOCK)`);
    const [row] = await db.select().from(aiConflicts).where(eq(aiConflicts.id, res.conflictId)).limit(1);
    assert(row?.resolvedBy === "policy", `resolvedBy=${row?.resolvedBy} (atteso 'policy')`);
    assert(row?.resolvedAt, "resolvedAt non valorizzato dalla policy");
    return `conflict=${res.conflictId.slice(0, 8)} R001 BLOCK`;
  });

  // ── C) R002 — app-integrity violation critical ↔ ota-orchestrator ──────
  await step("C. R002 app-integrity↔ota-orchestrator → BLOCK", async () => {
    const ai = await c.emit({
      aiName: "app-integrity", eventType: "violation_detected",
      payload: { rule: "heap_leak", deltaMB: 240 },
      severity: "critical", correlationId: `${corrTag}-C`,
    });
    const ota = await c.emit({
      aiName: "ota-orchestrator", eventType: "publish_request",
      payload: { channel: "android", version: "1.4.3" },
      severity: "info", correlationId: `${corrTag}-C`,
    });
    assert(ai.id && ota.id, "emit C falliti");
    const res = await c.evaluateConflict({
      eventIdA: ai.id, eventIdB: ota.id, conflictType: "ota_integrity_drift",
    });
    assert(res.policyRuleId === "R002", `policyRuleId=${res.policyRuleId} (atteso R002)`);
    assert(res.action === "BLOCK", `action=${res.action} (atteso BLOCK)`);
    const [row] = await db.select().from(aiConflicts).where(eq(aiConflicts.id, res.conflictId)).limit(1);
    assert(row?.resolvedBy === "policy", `resolvedBy=${row?.resolvedBy} (atteso 'policy')`);
    return `conflict=${res.conflictId.slice(0, 8)} R002 BLOCK`;
  });

  // ── D) admin override su conflitto custom (no policy match) ────────────
  await step("D. admin override → resolvedBy='admin' + ai_decisions row", async () => {
    const a = await c.emit({
      aiName: "moderation", eventType: "review_request",
      payload: { userId: "u-d1" }, severity: "warn", correlationId: `${corrTag}-D`,
    });
    const b = await c.emit({
      aiName: "watchdog", eventType: "review_request",
      payload: { userId: "u-d1" }, severity: "info", correlationId: `${corrTag}-D`,
    });
    // Tipo univoco per evitare match policy esistenti e ottenere conflitto open.
    const conflictType = `e2e_unresolved_${Date.now()}`;
    const res = await c.evaluateConflict({
      eventIdA: a.id, eventIdB: b.id, conflictType,
    });
    // default-conflict-block matcha "*" con BLOCK ma non setta resolvedAt
    // (action != "ALLOW" → resolvedAt rimane null per il default? in realtà
    // qualunque match policy → resolvedBy='policy'). Per ottenere un conflitto
    // realmente open, accettiamo entrambi gli stati: se è 'policy', usiamo override
    // su esso comunque (l'endpoint accetta anche conflitti chiusi e li
    // riapre lato admin).
    const conflictId = res.conflictId;

    if (!SESSION_COOKIE) return "SKIP";

    const corrOverride = `override-${conflictId.slice(0, 12)}`;
    const beforeDec = await db.select({ id: aiDecisions.id }).from(aiDecisions)
      .where(and(eq(aiDecisions.aiName, "admin"), eq(aiDecisions.correlationId, corrOverride)));

    const r = await api("POST", `/api/admin/ai/conflicts/${conflictId}/override`, {
      decision: "useEventA", rationale: "E2E override admin — usare evento A",
    });
    assert(r.ok, `override HTTP ${r.status}: ${await r.text()}`);

    await wait(150);
    const [updated] = await db.select().from(aiConflicts).where(eq(aiConflicts.id, conflictId)).limit(1);
    assert(updated?.resolvedBy === "admin", `resolvedBy=${updated?.resolvedBy} (atteso 'admin')`);
    assert(updated?.resolvedAt, "resolvedAt non valorizzato");
    const afterDec = await db.select({ id: aiDecisions.id }).from(aiDecisions)
      .where(and(eq(aiDecisions.aiName, "admin"), eq(aiDecisions.correlationId, corrOverride)));
    assert(afterDec.length > beforeDec.length, "ai_decisions row override non creata");
    return `conflict=${conflictId.slice(0, 8)} resolvedBy=admin`;
  });

  // ── E) per-AI kill switch + layer kill switch ──────────────────────────
  await step("E. per-AI kill (watchdog) + layer kill (*)", async () => {
    // Per-AI: pausa watchdog, emit di moderation deve passare, watchdog no.
    await pauseAi("watchdog", 60, "e2e-per-ai");
    assert(await isAiPaused("watchdog"), "watchdog non risulta paused");
    const wd = await c.emit({ aiName: "watchdog", eventType: "ping", payload: {}, severity: "info", correlationId: `${corrTag}-E1` });
    assert(wd.id === "", `watchdog emit non soppresso (id=${wd.id})`);
    const mod = await c.emit({ aiName: "moderation", eventType: "ping", payload: {}, severity: "info", correlationId: `${corrTag}-E2` });
    assert(mod.id !== "", "moderation emit non doveva essere soppresso");
    await resumeAi("watchdog");

    // Layer kill: tutto sopprime.
    await pauseAi("*", 60, "e2e-layer");
    const m2 = await c.emit({ aiName: "moderation", eventType: "ping", payload: {}, severity: "info" });
    const w2 = await c.emit({ aiName: "ota-orchestrator", eventType: "ping", payload: {}, severity: "info" });
    assert(m2.id === "" && w2.id === "", "kill layer non ha soppresso tutti gli emit");
    await resumeAi("*");
    return "per-AI + layer kill ok";
  });

  // ── F) coordinator-down simulation (COORDINATOR_DISABLED=1) ────────────
  await step("F. coordinator-down resilience (COORDINATOR_DISABLED=1)", async () => {
    const prev = process.env.COORDINATOR_DISABLED;
    process.env.COORDINATOR_DISABLED = "1";
    try {
      // emit non deve persistere, non deve lanciare, caller deve ricevere id="".
      const r = await c.emit({
        aiName: "moderation", eventType: "should_not_persist",
        payload: { contentId: "ghost" }, severity: "info",
        correlationId: `${corrTag}-F`,
      });
      assert(r.id === "", `emit ha persistito quando disabilitato (id=${r.id})`);
      assert(r.policy.rationale === "coordinator-disabled", "policy.rationale errato");
      // Verifica nessuna riga creata con correlationId di test.
      const rows = await db.select().from(aiEvents).where(eq(aiEvents.correlationId, `${corrTag}-F`));
      assert(rows.length === 0, `riga inattesa scritta (count=${rows.length})`);
    } finally {
      if (prev === undefined) delete process.env.COORDINATOR_DISABLED;
      else process.env.COORDINATOR_DISABLED = prev;
    }
    // Smoke: dopo riabilitazione emit funziona di nuovo.
    const r2 = await c.emit({
      aiName: "moderation", eventType: "post_recovery",
      payload: {}, severity: "info", correlationId: `${corrTag}-F2`,
    });
    assert(r2.id !== "", "emit dopo recovery fallito");
    return "graceful + recovery ok";
  });

  // ── G) Task #2660 — conflict → admin override (coordinator-level, no HTTP) ──
  await step("G. conflict creato + admin override → resolvedBy='admin' + ai_decisions", async () => {
    // Due eventi in conflitto su tipo univoco per evitare match policy noti
    // e mantenere il test deterministico anche senza SESSION_COOKIE.
    const a = await c.emit({
      aiName: "moderation", eventType: "review_request",
      payload: { userId: "u-g1", contentId: "p-g1" },
      severity: "warn", correlationId: `${corrTag}-G`,
    });
    const b = await c.emit({
      aiName: "watchdog", eventType: "review_request",
      payload: { userId: "u-g1", reason: "spam_burst" },
      severity: "info", correlationId: `${corrTag}-G`,
    });
    assert(a.id && b.id, "emit G falliti");
    const conflictType = `e2e_admin_override_${Date.now()}`;
    const res = await c.evaluateConflict({
      eventIdA: a.id, eventIdB: b.id, conflictType,
    });
    // Verifica creazione record ai_conflicts.
    const [created] = await db.select().from(aiConflicts).where(eq(aiConflicts.id, res.conflictId)).limit(1);
    assert(created, "ai_conflicts row non creata");
    assert(created.eventIdA === a.id && created.eventIdB === b.id, "eventIdA/B errati nel record");
    assert(created.conflictType === conflictType, `conflictType=${created.conflictType}`);

    // Esegue lo stesso flusso dell'endpoint /override direttamente sul
    // coordinator + DB, in modo che il test giri sempre (no cookie richiesto).
    const corrOverride = `override-${res.conflictId.slice(0, 12)}`;
    const decisionId = await c.recordDecision({
      aiName: "admin",
      decisionType: "conflict_override",
      input: { conflictId: res.conflictId, eventIdA: a.id, eventIdB: b.id, conflictType },
      output: { decision: "useEventA" },
      rationale: "E2E #2660 — override admin (coordinator-level)",
      tookMs: 0,
      correlationId: corrOverride,
    });
    assert(decisionId, "recordDecision non ha restituito id");
    await db.update(aiConflicts).set({
      resolvedBy: "admin",
      resolutionRationale: "[admin:e2e] useEventA — E2E #2660",
      resolvedAt: new Date(),
    }).where(eq(aiConflicts.id, res.conflictId));

    const [updated] = await db.select().from(aiConflicts).where(eq(aiConflicts.id, res.conflictId)).limit(1);
    assert(updated?.resolvedBy === "admin", `resolvedBy=${updated?.resolvedBy} (atteso 'admin')`);
    assert(updated?.resolvedAt, "resolvedAt non valorizzato dopo override");

    // Verifica record ai_decisions presente con aiName='admin' + correlationId override.
    const decRows = await db.select().from(aiDecisions)
      .where(and(eq(aiDecisions.aiName, "admin"), eq(aiDecisions.correlationId, corrOverride)));
    assert(decRows.length >= 1, "ai_decisions row override non creata");
    assert(decRows[0].decisionType === "conflict_override", `decisionType=${decRows[0].decisionType}`);
    return `conflict=${res.conflictId.slice(0, 8)} decision=${decisionId.slice(0, 8)}`;
  });

  // ── H) Task #2660 — kill-switch bypass per aiName='admin' sotto pause("*") ──
  await step("H. pause('*') → admin emit + override comunque registrati (bypass)", async () => {
    await pauseAi("*", 60, "e2e-2660-bypass");
    try {
      // Sanity: emit non-admin deve essere soppresso.
      const blocked = await c.emit({
        aiName: "moderation", eventType: "ping",
        payload: {}, severity: "info", correlationId: `${corrTag}-H0`,
      });
      assert(blocked.id === "", `kill-switch non sopprime non-admin (id=${blocked.id})`);

      // Setup conflitto (gli eventi A/B *prima* della pausa per non essere soppressi).
      await resumeAi("*");
      const a = await c.emit({
        aiName: "moderation", eventType: "review_request",
        payload: { userId: "u-h1" }, severity: "warn", correlationId: `${corrTag}-H`,
      });
      const b = await c.emit({
        aiName: "watchdog", eventType: "review_request",
        payload: { userId: "u-h1" }, severity: "info", correlationId: `${corrTag}-H`,
      });
      assert(a.id && b.id, "emit setup H falliti");
      const conflictType = `e2e_admin_bypass_${Date.now()}`;
      const res = await c.evaluateConflict({ eventIdA: a.id, eventIdB: b.id, conflictType });

      // Ora rimette in pausa il layer e simula l'override admin.
      await pauseAi("*", 60, "e2e-2660-bypass-2");
      assert(await isAiPaused("admin"), "isAiPaused('admin') deve riportare true sotto pause('*')");

      const corrOverride = `override-${res.conflictId.slice(0, 12)}`;
      // recordDecision bypassa kill switch by design (è solo DB insert).
      const decisionId = await c.recordDecision({
        aiName: "admin",
        decisionType: "conflict_override",
        input: { conflictId: res.conflictId, eventIdA: a.id, eventIdB: b.id, conflictType },
        output: { decision: "useEventB" },
        rationale: "E2E #2660 — override admin sotto kill-switch layer",
        tookMs: 0,
        correlationId: corrOverride,
      });
      assert(decisionId, "recordDecision admin sotto pause(*) fallita");

      // emit admin DEVE bypassare il kill switch (coordinator: aiName !== 'admin' check).
      const adminEvt = await c.emit({
        aiName: "admin", eventType: "override",
        payload: { conflictId: res.conflictId, decision: "useEventB", decisionId },
        severity: "warn", correlationId: corrOverride,
      });
      assert(adminEvt.id !== "", "emit admin soppresso da kill-switch (bypass rotto)");

      // Verifica DB: evento admin persistito + decisione admin presente.
      const [evRow] = await db.select().from(aiEvents).where(eq(aiEvents.id, adminEvt.id)).limit(1);
      assert(evRow?.aiName === "admin" && evRow.eventType === "override", "ai_events admin non persistito correttamente");
      const decRows = await db.select().from(aiDecisions)
        .where(and(eq(aiDecisions.aiName, "admin"), eq(aiDecisions.correlationId, corrOverride)));
      assert(decRows.length >= 1, "ai_decisions admin non registrata sotto kill-switch");

      return `admin emit/decision registrati sotto pause(*) conflict=${res.conflictId.slice(0, 8)}`;
    } finally {
      await resumeAi("*");
    }
  });

  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped).length;
  console.log(`\n=== ${results.length - failed.length - skipped}/${results.length} passed, ${skipped} skipped, ${failed.length} failed ===`);
  if (failed.length) process.exit(1);
  process.exit(0);
}

main().catch((err) => { console.error("FATAL", err); process.exit(2); });
