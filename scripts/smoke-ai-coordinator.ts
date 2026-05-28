// Task #2649 — Smoke test del Layer AI Coordinato (greenfield).
// Verifica end-to-end senza nessuna AI collegata al bus:
//   1. emit di 10 eventi da 3 aiName → fanout locale ricevuto in ordine.
//   2. recordDecision + query audit con filtri.
//   3. evaluateConflict con regola di policy attiva → resolvedBy=policy.
//   4. hot-reload policy YAML (file temporaneo) → nuova regola applicata.
//   5. export CSV/NDJSON dimensioni > 0.
//
// Uscita: exit 0 = OK, exit 1 = qualunque assertion fallisce.
import fs from "fs";
import path from "path";
import os from "os";
import { getCoordinator } from "../server/ai/coordinator";
import { queryAudit, streamAuditAsCsv, streamAuditAsNdjson } from "../server/ai/coordinator/audit";
import {
  evaluateConflict,
  evaluateEvent,
  getPolicyStatus,
  loadPolicies,
} from "../server/ai/coordinator/policy-engine";
import { runCoordinatorCleanup } from "../server/ai/coordinator/cleanup";

const RUN_ID = `smoke-${Date.now()}`;
const failures: string[] = [];
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("❌", msg);
    failures.push(msg);
  } else {
    console.log("✅", msg);
  }
}

async function main(): Promise<void> {
  console.log(`[smoke-ai-coordinator] RUN_ID=${RUN_ID}`);

  // 0. policy load
  const initial = loadPolicies();
  assert(initial.ok, `policy load OK (${initial.count} rules)`);

  const coord = getCoordinator();

  // 1. emit 10 eventi da 3 aiName + fanout locale
  const received: Array<{ aiName: string; eventType: string }> = [];
  const sub = await coord.subscribe("*", (evt) => {
    if (evt.correlationId === RUN_ID) {
      received.push({ aiName: evt.aiName, eventType: evt.eventType });
    }
  });

  const eventIds: Array<{ id: string; aiName: string }> = [];
  const ais = ["smoke-watchdog", "smoke-moderation", "smoke-integrity"];
  for (let i = 0; i < 10; i++) {
    const aiName = ais[i % ais.length];
    const sev = i === 7 ? "critical" : i % 2 === 0 ? "info" : "warn";
    const r = await coord.emit({
      aiName,
      eventType: `smoke_event_${i}`,
      payload: { i, run: RUN_ID },
      severity: sev as "info" | "warn" | "critical",
      correlationId: RUN_ID,
    });
    eventIds.push({ id: r.id, aiName });
  }
  // Attesa breve per fanout async
  await new Promise((r) => setTimeout(r, 200));
  assert(received.length >= 10, `fanout locale ricevuto: ${received.length}/10 eventi`);

  // 1b. policy on emit: severity=critical → action=NOTIFY (seed rule)
  const criticalEval = evaluateEvent({
    aiName: "smoke-watchdog",
    eventType: "smoke_event_7",
    payload: {},
    severity: "critical",
  });
  assert(criticalEval.action === "NOTIFY", `policy seed: severity=critical → NOTIFY (got ${criticalEval.action})`);

  // 2. recordDecision + audit query
  for (let i = 0; i < 5; i++) {
    await coord.recordDecision({
      aiName: ais[i % ais.length],
      decisionType: "smoke_decision",
      input: { i, run: RUN_ID },
      output: { ok: true },
      rationale: `smoke decision #${i}`,
      confidence: 0.8 + i * 0.01,
      tookMs: 100 + i * 10,
      correlationId: RUN_ID,
    });
  }

  const audit = await queryAudit({ correlationId: RUN_ID, limit: 500 });
  const auditEvents = audit.rows.filter((r) => r.kind === "event").length;
  const auditDecisions = audit.rows.filter((r) => r.kind === "decision").length;
  assert(auditEvents >= 10, `audit events: ${auditEvents}/10`);
  assert(auditDecisions >= 5, `audit decisions: ${auditDecisions}/5`);

  // 3. evaluateConflict — carica una policy temporanea che matcha i nomi smoke-*.
  const seedConflictFile = path.join(os.tmpdir(), `ai-policies-smoke-seed-${Date.now()}.yaml`);
  fs.writeFileSync(seedConflictFile, `version: 1
rules:
  - id: smoke-watchdog-wins
    name: Smoke — watchdog vince kill_switch
    priority: 90
    conflictType: kill_switch
    when:
      aiName: smoke-watchdog
    then:
      action: ALLOW
      message: "smoke seed: watchdog wins"
  - id: smoke-default-block
    name: Smoke default block
    priority: 1
    conflictType: "*"
    when: {}
    then:
      action: BLOCK
      message: "smoke default block"
`, "utf8");
  const seedReload = loadPolicies(seedConflictFile);
  assert(seedReload.ok, `seed policy smoke caricata (${seedReload.count} rules)`);

  const wd = eventIds.find((e) => e.aiName === "smoke-watchdog")!;
  const md = eventIds.find((e) => e.aiName === "smoke-moderation")!;
  const conflict = await coord.evaluateConflict({
    eventIdA: wd.id,
    eventIdB: md.id,
    conflictType: "kill_switch",
  });
  assert(conflict.resolvedBy === "policy", `conflitto risolto da policy (got ${conflict.resolvedBy})`);
  assert(conflict.policyRuleId === "smoke-watchdog-wins",
    `policy rule applicata: ${conflict.policyRuleId}`);
  assert(conflict.action === "ALLOW", `azione policy = ALLOW (got ${conflict.action})`);

  // 4. Hot-reload YAML: scrivi una regola che cambia l'esito
  const tmpFile = path.join(os.tmpdir(), `ai-policies-smoke-${Date.now()}.yaml`);
  fs.writeFileSync(tmpFile, `version: 1
rules:
  - id: smoke-block-killswitch
    name: Smoke override — blocca tutti i kill_switch
    priority: 1000
    conflictType: kill_switch
    when: {}
    then:
      action: BLOCK
      message: "smoke override"
  - id: smoke-allow-default
    name: Smoke default allow
    priority: 1
    when: {}
    then:
      action: ALLOW
      message: ""
`, "utf8");
  const reload = loadPolicies(tmpFile);
  assert(reload.ok && reload.count === 2, `hot-reload tmp policy OK (${reload.count} rules)`);

  const conflict2 = evaluateConflict("kill_switch", {
    aiName: "smoke-watchdog", eventType: "x", payload: {}, severity: "info" as const,
  }, {
    aiName: "smoke-moderation", eventType: "y", payload: {}, severity: "info" as const,
  });
  assert(conflict2.action === "BLOCK", `dopo hot-reload: action=BLOCK (got ${conflict2.action})`);
  assert(conflict2.ruleId === "smoke-block-killswitch",
    `nuova rule applicata: ${conflict2.ruleId}`);

  // 4b. Ripristino delle regole seed
  loadPolicies(); // default file
  const restored = getPolicyStatus();
  assert(restored.source === "file" || restored.source === "default",
    `policy ripristinata: source=${restored.source}, rules=${restored.rulesCount}`);

  // 5. export CSV/NDJSON (capture via stub Response).
  function makeRes(): { res: unknown; chunks: string[] } {
    const chunks: string[] = [];
    const res = {
      setHeader: () => undefined,
      write: (chunk: string | Buffer) => { chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)); return true; },
      end: () => undefined,
    };
    return { res, chunks };
  }
  const csv = makeRes();
  streamAuditAsCsv(csv.res as unknown as Parameters<typeof streamAuditAsCsv>[0], audit.rows);
  const csvSize = csv.chunks.join("").length;
  assert(csvSize > 0, `export CSV bytes: ${csvSize}`);

  const ndjson = makeRes();
  streamAuditAsNdjson(ndjson.res as unknown as Parameters<typeof streamAuditAsNdjson>[0], audit.rows);
  const ndjsonSize = ndjson.chunks.join("").length;
  assert(ndjsonSize > 0, `export NDJSON bytes: ${ndjsonSize}`);

  // 6. cleanup retention (dry-ish: retention default 90d, smoke data fresca → 0 deleted)
  const cleanup = await runCoordinatorCleanup();
  assert(cleanup.events === 0 && cleanup.decisions === 0,
    `cleanup retention non tocca dati freschi (events=${cleanup.events} decisions=${cleanup.decisions})`);

  await sub.unsubscribe();
  fs.unlinkSync(tmpFile);
  if (fs.existsSync(seedConflictFile)) fs.unlinkSync(seedConflictFile);

  if (failures.length > 0) {
    console.error(`\n❌ SMOKE FAILED — ${failures.length} assertion failed:`);
    for (const f of failures) console.error("  -", f);
    process.exit(1);
  }
  console.log("\n✅ SMOKE OK — Layer AI Coordinato funzionante");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ SMOKE crash:", err);
  process.exit(1);
});
