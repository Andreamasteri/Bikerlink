/**
 * Test protocol for Quebracho→matching coordinator wiring.
 * Task #271 — "moto reale" verification.
 *
 * Runs directly against the live process modules (same DB, same in-memory state).
 * Safe to run: all writes are reversed at the end (resume clears the pause).
 */

import { storage } from "../server/storage";
import {
  getCoordinatorSnapshot,
  canRunCycleNow,
  applyCoordinatorDirective,
  __resetCoordinatorForTests,
} from "../server/matching/coordinator";
import { isQuebrachoReachable } from "../server/lib/quebracho-client";
import { isThinkCentreOffline } from "../server/lib/thinkcentre-offline";

function pass(msg: string) { console.log(`  ✅ PASS — ${msg}`); }
function fail(msg: string) { console.error(`  ❌ FAIL — ${msg}`); }
function info(msg: string) { console.log(`  ℹ️  ${msg}`); }

const results: { step: string; status: "PASS" | "FAIL" | "SKIP"; detail: string }[] = [];
function record(step: string, ok: boolean | null, detail: string) {
  if (ok === null) {
    results.push({ step, status: "SKIP", detail });
    console.log(`  ⚠️  SKIP — ${step}: ${detail}`);
  } else if (ok) {
    results.push({ step, status: "PASS", detail });
    pass(`${step}: ${detail}`);
  } else {
    results.push({ step, status: "FAIL", detail });
    fail(`${step}: ${detail}`);
  }
}

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Quebracho → Matching Coordinator wiring test (Task #271)");
  console.log(`  Run at: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // ── Step 1: Pre-flight ─────────────────────────────────────────────────────
  console.log("── Step 1: Pre-flight check ──");
  const tcOffline = await isThinkCentreOffline();
  record("1a_tc_online", !tcOffline, tcOffline ? "ThinkCentre is OFFLINE" : "ThinkCentre is online");

  const qReachable = await isQuebrachoReachable();
  record("1b_quebracho_reachable", qReachable, qReachable ? "Quebracho is reachable" : "Quebracho is NOT reachable");

  if (tcOffline || !qReachable) {
    console.log("\n⛔ Pre-flight failed — stopping test (TC or Quebracho offline).");
    return printSummary();
  }

  // ── Step 2: Coordinator snapshot shows quebrachoReachable=true ─────────────
  console.log("\n── Step 2: Coordinator snapshot ──");
  const snap1 = await getCoordinatorSnapshot();
  info(`state=${snap1.state}, quebrachoReachable=${snap1.quebrachoReachable}, horusReachable=${snap1.horusReachable}, thinkCentreOffline=${snap1.thinkCentreOffline}`);
  record("2a_snap_quebracho_reachable", snap1.quebrachoReachable, `quebrachoReachable=${snap1.quebrachoReachable}`);
  record("2b_snap_state_running", snap1.state === "running", `state=${snap1.state} (expected: running)`);
  record("2c_snap_no_active_directive", snap1.activeDirective === null, `activeDirective=${JSON.stringify(snap1.activeDirective)}`);

  // ── Step 3: canRunCycleNow returns allowed=true ────────────────────────────
  console.log("\n── Step 3: canRunCycleNow (baseline — should be allowed) ──");
  const dec1 = await canRunCycleNow();
  info(`allowed=${dec1.allowed}, state=${dec1.state}, source=${dec1.source}, forcedByHorus=${dec1.forcedByHorus}`);
  record("3a_can_run_allowed", dec1.allowed, `allowed=${dec1.allowed}`);
  record("3b_can_run_source_deterministic", dec1.source === "deterministic", `source=${dec1.source}`);

  // ── Step 4: Apply Quebracho pause, verify AppSetting written ──────────────
  console.log("\n── Step 4: Apply quebracho pause ──");
  // Reset in-memory first so we start from a known clean state
  __resetCoordinatorForTests();

  const pauseResult = await applyCoordinatorDirective("pause", { reason: "test-protocol-task-271" }, "quebracho");
  info(`applyDirective result: ok=${pauseResult.ok}, state=${pauseResult.ok ? pauseResult.state : pauseResult.error}`);
  record("4a_pause_applied", pauseResult.ok, `ok=${pauseResult.ok}`);
  if (pauseResult.ok) {
    record("4b_state_paused_by_ai", pauseResult.state === "paused_by_ai", `state=${pauseResult.state}`);
  }

  // Verify AppSetting was written correctly
  const settingRow = await storage.getAppSetting("matching_coordinator_directive:quebracho");
  info(`AppSetting value: ${JSON.stringify(settingRow?.valueJson)}`);
  const settingVal = settingRow?.valueJson as Record<string, string> | undefined;
  record("4c_appsetting_written", !!settingVal, settingVal ? "AppSetting exists" : "AppSetting NOT written");
  record("4d_appsetting_kind_pause", settingVal?.kind === "pause", `kind=${settingVal?.kind}`);
  record("4e_appsetting_issuer_quebracho", settingVal?.issuedBy === "quebracho", `issuedBy=${settingVal?.issuedBy}`);

  // ── Step 5: canRunCycleNow now returns allowed=false, source=quebracho ─────
  console.log("\n── Step 5: canRunCycleNow after quebracho pause ──");
  const dec2 = await canRunCycleNow();
  info(`allowed=${dec2.allowed}, state=${dec2.state}, source=${dec2.source}`);
  record("5a_blocked_after_pause", !dec2.allowed, `allowed=${dec2.allowed} (expected false)`);
  record("5b_source_quebracho", dec2.source === "quebracho", `source=${dec2.source} (expected quebracho)`);
  record("5c_state_paused_by_ai", dec2.state === "paused_by_ai", `state=${dec2.state}`);

  // ── Step 6: snapshot directives field has quebracho pause ─────────────────
  console.log("\n── Step 6: Snapshot after pause ──");
  const snap2 = await getCoordinatorSnapshot();
  info(`snapshot.directives.quebracho: ${JSON.stringify(snap2.directives.quebracho)}`);
  record("6a_snapshot_has_quebracho_directive", snap2.directives.quebracho?.kind === "pause", `directives.quebracho.kind=${snap2.directives.quebracho?.kind}`);
  record("6b_snapshot_active_directive_issuer", snap2.activeDirective?.issuedBy === "quebracho", `activeDirective.issuedBy=${snap2.activeDirective?.issuedBy}`);

  // ── Step 7: Resume clears the directive ──────────────────────────────────
  console.log("\n── Step 7: Resume directive from quebracho ──");
  const resumeResult = await applyCoordinatorDirective("resume", { reason: "test-protocol-cleanup" }, "quebracho");
  info(`resume result: ok=${resumeResult.ok}, state=${resumeResult.ok ? resumeResult.state : resumeResult.error}`);
  record("7a_resume_applied", resumeResult.ok, `ok=${resumeResult.ok}`);
  if (resumeResult.ok) {
    record("7b_state_running_after_resume", resumeResult.state === "running", `state=${resumeResult.state}`);
  }

  // Verify AppSetting cleared
  const settingAfterResume = await storage.getAppSetting("matching_coordinator_directive:quebracho");
  info(`AppSetting after resume: ${JSON.stringify(settingAfterResume?.valueJson)}`);
  const clearedVal = settingAfterResume?.valueJson as Record<string, string> | null | undefined;
  // After resume, persistDirective is called with null — upsertAppSetting stores null as valueJson
  const isCleared = clearedVal === null || clearedVal === undefined || (typeof clearedVal === "object" && Object.keys(clearedVal as object).length === 0);
  record("7c_appsetting_cleared", isCleared, `valueJson=${JSON.stringify(clearedVal)} (expected null/empty)`);

  // ── Step 8: canRunCycleNow after resume ───────────────────────────────────
  console.log("\n── Step 8: canRunCycleNow after resume ──");
  const dec3 = await canRunCycleNow();
  info(`allowed=${dec3.allowed}, state=${dec3.state}, source=${dec3.source}`);
  record("8a_allowed_after_resume", dec3.allowed, `allowed=${dec3.allowed}`);
  record("8b_source_deterministic_after_resume", dec3.source === "deterministic", `source=${dec3.source}`);

  // ── Step 9: force_cycle one-shot consumed correctly ───────────────────────
  console.log("\n── Step 9: force_cycle one-shot (consumed after first canRunCycleNow) ──");
  // Apply a quebracho pause first, then force_cycle
  __resetCoordinatorForTests();
  await applyCoordinatorDirective("pause", { reason: "test-force-cycle" }, "quebracho");
  await applyCoordinatorDirective("force_cycle", { reason: "test-force-cycle-bypass" }, "quebracho");
  const snapForce = await getCoordinatorSnapshot();
  record("9a_pending_force_in_snap", snapForce.pendingForceCycle === true, `pendingForceCycle=${snapForce.pendingForceCycle}`);

  const decForced = await canRunCycleNow();
  info(`forced: allowed=${decForced.allowed}, forcedByHorus=${decForced.forcedByHorus}, source=${decForced.source}`);
  record("9b_force_allows_run", decForced.allowed, `allowed=${decForced.allowed}`);
  record("9c_force_marked_forcedByHorus", decForced.forcedByHorus, `forcedByHorus=${decForced.forcedByHorus}`);

  // Second call — should be blocked again (one-shot consumed)
  const decAfterForce = await canRunCycleNow();
  info(`post-force: allowed=${decAfterForce.allowed}`);
  record("9d_force_one_shot_consumed", !decAfterForce.allowed, `allowed=${decAfterForce.allowed} (expected false — one-shot consumed)`);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\n── Cleanup: resume all directives ──");
  await applyCoordinatorDirective("resume", { reason: "test-cleanup" }, "quebracho");
  __resetCoordinatorForTests();
  // Verify clean state
  const snapClean = await getCoordinatorSnapshot();
  info(`Final state: ${snapClean.state}`);

  return printSummary();
}

function printSummary() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  RESULTS SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  let passed = 0, failed = 0, skipped = 0;
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⚠️ ";
    console.log(`  ${icon} [${r.status}] ${r.step}: ${r.detail}`);
    if (r.status === "PASS") passed++;
    else if (r.status === "FAIL") failed++;
    else skipped++;
  }
  console.log(`\n  Total: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("═══════════════════════════════════════════════════════════════\n");
  return { results, passed, failed, skipped };
}

main().then(({ failed }) => {
  process.exit(failed > 0 ? 1 : 0);
}).catch((err) => {
  console.error("Test script error:", err);
  process.exit(2);
});
