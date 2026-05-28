// Task #2654 — Smoke test integrazione 5 AI + OTA nel Coordinator.
// Verifica: ogni adapter emette eventi/decisioni e fallisce gracefully se il
// Coordinator è giù. Esegui con: npx tsx scripts/smoke-coordinator-integration.ts
import { getCoordinator } from "../server/ai/coordinator";
import { recordOtaDecision, shouldDelayForCoordinator } from "../server/ai/coordinator/integrations/ota";
import { emitModerationSuggestion } from "../server/ai/coordinator/integrations/moderation";
import { emitWatchdogAlert, emitWatchdogStatusChange, emitWatchdogKillSwitch } from "../server/ai/coordinator/integrations/watchdog";
import { emitDbViolation, emitDbAutofix } from "../server/ai/coordinator/integrations/db-integrity";
import { emitAppViolation, emitAppAutofix } from "../server/ai/coordinator/integrations/app-integrity";
import { emitConsoleQuery } from "../server/ai/coordinator/integrations/console";

async function main() {
  const failures: string[] = [];
  const pass = (n: string) => console.log(`  ✅ ${n}`);
  const fail = (n: string, e: unknown) => { failures.push(n); console.error(`  ❌ ${n}:`, (e as Error).message); };

  console.log("\n[1/8] Coordinator API base");
  try {
    const c = getCoordinator();
    const ev = await c.emit({ aiName: "watchdog", eventType: "smoke_test", payload: { src: "smoke" }, severity: "info" });
    if (!ev.id) throw new Error("emit non ha restituito id");
    pass("emit + id");
  } catch (e) { fail("Coordinator base", e); }

  console.log("\n[2/8] OTA recordDecision");
  try {
    await recordOtaDecision({
      decisionType: "PUBLISH_OTA",
      input: { adminId: "smoke", message: "smoke" },
      output: { jobRunId: "smoke" },
      tookMs: 1,
      correlationId: "smoke-ota",
    });
    pass("recordOtaDecision");
  } catch (e) { fail("OTA recordDecision", e); }

  console.log("\n[3/8] OTA shouldDelay (nessun alert critical: deve essere delay=false)");
  try {
    const r = await shouldDelayForCoordinator({ action: "publish", correlationId: "smoke-delay" });
    if (r.delay) console.log(`     ⚠ delay=true (atteso solo se ci sono alert critical recenti): ${r.reason}`);
    pass("shouldDelay risposta valida");
  } catch (e) { fail("OTA shouldDelay", e); }

  console.log("\n[4/8] Moderation emit");
  try {
    await emitModerationSuggestion({
      reportId: "smoke-report-id",
      reportedUserId: "smoke-u1",
      reporterId: "smoke-u2",
      suggestion: { suggestedAction: "warn", severitySuggested: "low", confidence: 0.5 },
    });
    pass("emitModerationSuggestion");
  } catch (e) { fail("Moderation emit", e); }

  console.log("\n[5/8] Watchdog 3 emit");
  try {
    await emitWatchdogAlert({ problem: { id: "smoke.p1", title: "smoke problem", severity: "critical" }, score: 10, status: "red" });
    await emitWatchdogStatusChange({ status: "red", score: 10, topProblem: "smoke" });
    await emitWatchdogKillSwitch({ enabled: false, triggeredBy: "smoke", reason: "test" });
    pass("watchdog × 3");
  } catch (e) { fail("Watchdog emit", e); }

  console.log("\n[6/8] DB Integrity emit");
  try {
    await emitDbViolation({ runId: "smoke-run", checkId: "smoke.c1", checkName: "smoke check", category: "orphans", count: 1, severity: "critical" });
    await emitDbAutofix({ runId: "smoke-run", checkId: "smoke.c1", applied: true, affected: 1, summary: "smoke autofix" });
    pass("db-integrity × 2");
  } catch (e) { fail("DB Integrity emit", e); }

  console.log("\n[7/8] App Integrity emit");
  try {
    await emitAppViolation({ runId: "smoke-app", checkId: "smoke.app", checkName: "smoke", family: "assets", count: 1, severity: "high" });
    await emitAppAutofix({ runId: "smoke-app", checkId: "smoke.app", applied: false, affected: 0, summary: "no autofix" });
    pass("app-integrity × 2");
  } catch (e) { fail("App Integrity emit", e); }

  console.log("\n[8/8] Console emit");
  try {
    await emitConsoleQuery({ adminId: "smoke-admin", scopes: ["watchdog"], queryPreview: "smoke query", cached: false });
    pass("emitConsoleQuery");
  } catch (e) { fail("Console emit", e); }

  console.log("\n[verify] query Coordinator per smoke events");
  try {
    const c = getCoordinator();
    const r = await c.query({ sinceHours: 1, limit: 50 });
    const smoke = r.rows.filter((e) => JSON.stringify(e.payload ?? {}).includes("smoke"));
    console.log(`  ${smoke.length} eventi smoke trovati nelle ultime 1h`);
    if (smoke.length === 0) failures.push("nessun evento smoke trovato in query");
  } catch (e) { fail("verify query", e); }

  console.log("\n[fallback] graceful quando Coordinator emit lancia eccezione");
  try {
    const c = getCoordinator();
    const origEmit = c.emit.bind(c);
    const origQuery = c.query.bind(c);
    (c as unknown as { emit: typeof origEmit }).emit = async () => { throw new Error("simulated coordinator down"); };
    (c as unknown as { query: typeof origQuery }).query = async () => { throw new Error("simulated coordinator down"); };
    try {
      // Tutti gli emit*: NON devono propagare
      await emitModerationSuggestion({ reportId: "x", reportedUserId: "x", reporterId: "x", suggestion: { suggestedAction: "warn", severitySuggested: "low" } });
      await emitWatchdogAlert({ problem: { id: "x", title: "x", severity: "critical" }, score: 0, status: "red" });
      await emitDbViolation({ runId: "x", checkId: "x", checkName: "x", category: "orphans", count: 1, severity: "critical" });
      await emitAppViolation({ runId: "x", checkId: "x", checkName: "x", family: "assets", count: 1, severity: "critical" });
      await emitConsoleQuery({ adminId: "x", scopes: [], queryPreview: "x", cached: false });
      await recordOtaDecision({ decisionType: "PUBLISH_OTA", input: {}, output: {}, tookMs: 0 });
      const delay = await shouldDelayForCoordinator({ action: "publish", correlationId: "x" });
      if (delay.delay) throw new Error("shouldDelay con coordinator giù deve essere false (fallback)");
      pass("nessuna eccezione propagata + shouldDelay fallback graceful");
    } finally {
      (c as unknown as { emit: typeof origEmit }).emit = origEmit;
      (c as unknown as { query: typeof origQuery }).query = origQuery;
    }
  } catch (e) { fail("fallback graceful", e); }

  console.log(`\n${failures.length === 0 ? "✅ SMOKE OK" : `❌ FALLITO: ${failures.join(", ")}`}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(2); });
