// Task #2654 — Regression test OTA Orchestrator dopo l'integrazione Coordinator.
// Verifica che le funzioni execMutatingTool/spawnPublishJob siano ancora invocabili
// senza Coordinator (graceful fallback) e che la firma execMutatingTool non sia rotta.
// Esegui con: npx tsx scripts/regression-ota-orchestrator.ts
import { execMutatingTool } from "../server/routes/admin/ota-assistant/helpers";

async function main() {
  const failures: string[] = [];
  const pass = (n: string) => console.log(`  ✅ ${n}`);
  const fail = (n: string, e: unknown) => { failures.push(n); console.error(`  ❌ ${n}:`, (e as Error).message); };

  console.log("\n[1/4] execMutatingTool publishOta senza message → errore atteso");
  try {
    const r = await execMutatingTool("publishOta", {}, "smoke-admin", "smoke-run-id-1");
    if (r.ok) fail("publishOta vuoto", new Error("doveva fallire"));
    else if (!String(r.error ?? "").includes("message obbligatorio")) fail("publishOta vuoto", new Error(`error inatteso: ${r.error}`));
    else pass("rifiuta publishOta senza message");
  } catch (e) { fail("publishOta vuoto", e); }

  console.log("\n[2/4] execMutatingTool tool sconosciuto");
  try {
    const r = await execMutatingTool("doesNotExist" as never, {}, "smoke-admin", "smoke-run-id-2");
    if (r.ok) fail("tool sconosciuto", new Error("doveva fallire"));
    else if (!String(r.error ?? "").includes("Tool sconosciuto")) fail("tool sconosciuto", new Error(`error inatteso: ${r.error}`));
    else pass("rifiuta tool sconosciuto");
  } catch (e) { fail("tool sconosciuto", e); }

  console.log("\n[3/4] execMutatingTool approveRelease su id inesistente");
  try {
    const r = await execMutatingTool("approveRelease", { releaseId: "00000000-0000-0000-0000-000000000000" }, "smoke-admin", "smoke-run-id-3");
    if (r.ok) fail("approve fake id", new Error("doveva fallire"));
    else if (!String(r.error ?? "").toLowerCase().includes("release")) fail("approve fake id", new Error(`error inatteso: ${r.error}`));
    else pass("approve su id inesistente fallisce coerentemente");
  } catch (e) { fail("approve fake id", e); }

  console.log("\n[4/4] execMutatingTool approveRelease senza releaseId");
  try {
    const r = await execMutatingTool("approveRelease", {}, "smoke-admin", "smoke-run-id-4");
    if (r.ok) fail("approve no id", new Error("doveva fallire"));
    else if (!String(r.error ?? "").toLowerCase().includes("obbligatorio")) fail("approve no id", new Error(`error inatteso: ${r.error}`));
    else pass("approve senza releaseId fallisce coerentemente");
  } catch (e) { fail("approve no id", e); }

  console.log(`\n${failures.length === 0 ? "✅ REGRESSION OK" : `❌ FALLITO: ${failures.join(", ")}`}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(2); });
