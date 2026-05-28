// Task #2654 — Regression OTA Orchestrator: parità UP vs DOWN Coordinator.
// Requisito: l'OTA orchestrator deve produrre lo STESSO outcome (success/error)
// quando il Coordinator è UP vs DOWN, eccetto nei casi in cui R001 (watchdog
// alert critical) o R002 (app-integrity violation critical) hanno deciso BLOCK.
// Esegui con: npx tsx scripts/regression-ota-orchestrator.ts
import { execMutatingTool } from "../server/routes/admin/ota-assistant/helpers";
import { getCoordinator } from "../server/ai/coordinator";

interface Scenario {
  name: string;
  tool: string;
  args: Record<string, unknown>;
  expectOk: boolean;
  errorIncludes?: string;
}

const SCENARIOS: Scenario[] = [
  { name: "publishOta senza message", tool: "publishOta", args: {}, expectOk: false, errorIncludes: "message obbligatorio" },
  { name: "tool sconosciuto", tool: "doesNotExist", args: {}, expectOk: false, errorIncludes: "Tool sconosciuto" },
  { name: "approveRelease senza id", tool: "approveRelease", args: {}, expectOk: false, errorIncludes: "obbligatorio" },
  { name: "approveRelease id inesistente", tool: "approveRelease", args: { releaseId: "00000000-0000-0000-0000-000000000000" }, expectOk: false, errorIncludes: "release" },
  { name: "rejectRelease senza id", tool: "rejectRelease", args: {}, expectOk: false, errorIncludes: "obbligatorio" },
  { name: "rollbackToGroup senza id", tool: "rollbackToGroup", args: {}, expectOk: false, errorIncludes: "obbligatorio" },
  { name: "forceUpdateDevice senza args", tool: "forceUpdateDevice", args: {}, expectOk: false, errorIncludes: "obbligatori" },
];

type Outcome = { ok: boolean; errorPrefix: string | null };

function outcome(r: { ok: boolean; error?: string }): Outcome {
  return { ok: r.ok, errorPrefix: (r.error ?? "").slice(0, 60) || null };
}

async function runScenario(s: Scenario, runId: string): Promise<Outcome> {
  const r = await execMutatingTool(s.tool, s.args, "regression-admin", runId);
  return outcome(r);
}

async function main() {
  const failures: string[] = [];
  const pass = (n: string) => console.log(`  ✅ ${n}`);
  const fail = (n: string, msg: string) => { failures.push(`${n}: ${msg}`); console.error(`  ❌ ${n}: ${msg}`); };

  console.log("\n── FASE A: Coordinator UP — baseline ──");
  const upResults = new Map<string, Outcome>();
  for (const s of SCENARIOS) {
    const o = await runScenario(s, `regress-up-${s.tool}`);
    upResults.set(s.name, o);
    if (o.ok !== s.expectOk) fail(s.name, `UP: ok=${o.ok}, atteso ${s.expectOk}`);
    else if (!s.expectOk && s.errorIncludes && !(o.errorPrefix ?? "").toLowerCase().includes(s.errorIncludes.toLowerCase()))
      fail(s.name, `UP: errorPrefix="${o.errorPrefix}" non contiene "${s.errorIncludes}"`);
    else pass(`UP ${s.name}`);
  }

  console.log("\n── FASE B: Coordinator DOWN — parità outcome ──");
  const c = getCoordinator();
  const origEmit = c.emit.bind(c);
  const origQuery = c.query.bind(c);
  const origRecord = c.recordDecision.bind(c);
  const origEval = c.evaluateConflict.bind(c);
  (c as unknown as { emit: typeof origEmit }).emit = async () => { throw new Error("simulated coordinator down"); };
  (c as unknown as { query: typeof origQuery }).query = async () => { throw new Error("simulated coordinator down"); };
  (c as unknown as { recordDecision: typeof origRecord }).recordDecision = async () => { throw new Error("simulated coordinator down"); };
  (c as unknown as { evaluateConflict: typeof origEval }).evaluateConflict = async () => { throw new Error("simulated coordinator down"); };

  try {
    for (const s of SCENARIOS) {
      const o = await runScenario(s, `regress-down-${s.tool}`);
      const up = upResults.get(s.name)!;
      // Requisito: parità ok/ok, parità prefisso errore (deve essere lo stesso messaggio applicativo, NON "Coordinator down")
      if (o.ok !== up.ok) fail(s.name, `DOWN: ok=${o.ok}, UP era ${up.ok} (regression!)`);
      else if (o.errorPrefix !== up.errorPrefix) fail(s.name, `DOWN: errorPrefix divergente UP="${up.errorPrefix}" DOWN="${o.errorPrefix}"`);
      else pass(`DOWN parità ${s.name}`);
    }
  } finally {
    (c as unknown as { emit: typeof origEmit }).emit = origEmit;
    (c as unknown as { query: typeof origQuery }).query = origQuery;
    (c as unknown as { recordDecision: typeof origRecord }).recordDecision = origRecord;
    (c as unknown as { evaluateConflict: typeof origEval }).evaluateConflict = origEval;
  }

  console.log(`\n${failures.length === 0 ? "✅ REGRESSION OK (parità UP/DOWN su " + SCENARIOS.length + " scenari)" : `❌ FALLITO: ${failures.join("; ")}`}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(2); });
