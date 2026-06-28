// Task #3395 — Rete preventiva al boot, subito dopo le migration.
//
// === OBSERVABILITY PLANE — drift schema (SECONDARIO) ===
// Best-effort e NON bloccante: viene invocata fire-and-forget da server/index.ts.
// Due fasi:
//   1) genera + persiste il manifest/fingerprint dello schema corrente;
//   2) esegue SOLO i check del pack schema-registry (trigger "boot"), così un
//      drift dev↔prod viene LOGGATO a ogni avvio per visibilità precoce.
//
// De-dup (Task #5124): questo è un emitter SECONDARIO/diagnostico. NON è il
// proprietario degli alert né del semaforo di salute:
//   • i run "boot" sono esclusi da getLatestRunSummary/collector → non alterano
//     il semaforo basato sugli scan completi (notturno/manuale);
//   • il runner NON invia push critici per trigger "boot" (vedi runner.ts) →
//     niente alert duplicati a ogni avvio.
// L'emitter PRIMARIO per drift/integrità DB è lo scan schedulato in scheduler.ts
// (checks/schema-registry.ts), che possiede alerting + health state.
// Lo Phase 2b drift guard (boot-sequence.ts) resta un controllo STATICO distinto
// (registry ↔ file di migration), fatale, e non sovrappone questo runtime check.
import { loadAllChecks } from "./registry";
import { runIntegrityScan } from "./runner";
import { refreshSchemaManifest } from "./schema-manifest";

export async function runBootSchemaDriftCheck(): Promise<void> {
  // Fase 1 — manifest/fingerprint.
  try {
    const m = await refreshSchemaManifest();
    console.log(
      `[db-integrity/boot] manifest schema: ${m.tableCount} tabelle, ${m.columnCount} colonne, hash ${m.hash.slice(0, 12)}… (${m.environment})`,
    );
  } catch (e) {
    console.warn("[db-integrity/boot] generazione manifest fallita:", (e as Error).message);
  }

  // Fase 2 — scan drift solo-schema.
  try {
    const all = await loadAllChecks();
    const ids = all.filter((c) => c.category === "schema-registry").map((c) => c.id);
    if (!ids.length) {
      console.warn("[db-integrity/boot] nessun check schema-registry registrato, scan saltato");
      return;
    }
    const s = await runIntegrityScan({ trigger: "boot", onlyCheckIds: ids });
    if (s.violationsFound > 0) {
      console.warn(
        `[db-integrity/boot] DRIFT SCHEMA RILEVATO: ${s.violationsFound} violazioni (health ${s.health}, critical ${s.bySeverity.critical}). Vedi pannello admin DB Integrity.`,
      );
    } else {
      console.log("[db-integrity/boot] schema allineato al registry (nessun drift)");
    }
  } catch (e) {
    console.warn("[db-integrity/boot] scan drift schema fallito:", (e as Error).message);
  }
}
