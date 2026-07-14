/**
 * generate-db-check-report.ts
 *
 * Genera docs/bikerlink-db-check-report.md: una fotografia READ-ONLY della
 * coerenza del database BikerLink. NON applica alcuna modifica al DB.
 *
 * Cosa produce (in ordine):
 *   0. Contesto (popolamento tabelle dev).
 *   1. Inventario schema (tabelle, colonne, PK, UNIQUE, FK, CHECK) dal DB dev live.
 *   2. Integrità referenziale — per ogni FK, conteggio righe orfane (composite-safe) + esempi.
 *   3. Checklist deterministica chiusa (a–f): coordinate fuori range, timestamp
 *      impossibili, contatori negativi, entità attive con campi obbligatori NULL,
 *      telemetria/tracce senza GPS, valori-stato fuori dal set ammesso.
 *   4. Duplicati su colonne candidate-unique prive di constraint.
 *   5. Parità dev↔prod (deep-schema-parity) + drift registry↔migration + index-drift
 *      + schema-in-DB vs schema-nel-codice (Drizzle registry).
 *   6. Azioni consigliate ordinate per gravità.
 *
 * Il DB dev è interrogato live via DATABASE_URL. Il DB prod NON è raggiungibile
 * con connection string dalla sandbox: il confronto strutturale dev↔prod usa lo
 * snapshot offline server/data/deep-schema-parity.prod.json.
 *
 * La logica per-sezione vive in scripts/db-check/*. Questo file è solo l'orchestratore.
 *
 * Uso:
 *   npx tsx scripts/generate-db-check-report.ts
 */

import { Pool } from "pg";
import { writeFileSync } from "fs";
import { collectIntrospection, type Actions } from "./db-check/shared";
import { renderContext, renderInventory } from "./db-check/inventory";
import { renderFk, renderDuplicates } from "./db-check/fk-duplicates";
import { renderChecklist } from "./db-check/checklist";
import { renderParity } from "./db-check/parity";

const OUT = "docs/bikerlink-db-check-report.md";
const PROD_BASELINE = "server/data/deep-schema-parity.prod.json";
const NOW_ISO = new Date().toISOString();

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL non impostata.");
    process.exit(2);
  }
  const pool = new Pool({ connectionString: dbUrl });
  const actions: Actions = { blocking: [], important: [], cosmetic: [] };
  const out: string[] = [];

  const ctx = await collectIntrospection(pool, NOW_ISO, PROD_BASELINE);

  // Sezioni che interrogano il DB dev live (0–4).
  out.push(...renderContext(ctx));
  out.push(...renderInventory(ctx, actions));
  out.push(...(await renderFk(pool, ctx, actions)));
  out.push(...(await renderChecklist(pool, ctx, actions)));
  out.push(...(await renderDuplicates(pool, ctx, actions)));

  await pool.end();

  // Sezione 5: shell-out agli script di drift esistenti (read-only, no pool).
  out.push(...renderParity(ctx, actions));

  // ── 6. azioni consigliate ────────────────────────────────────────────────────
  const w = (s = "") => out.push(s);
  const dedup = (a: string[]) => [...new Set(a)];
  const blocking = dedup(actions.blocking);
  const important = dedup(actions.important);
  const cosmetic = dedup(actions.cosmetic);

  w(`## 6. Azioni consigliate`);
  w();
  w(`### 🔴 Bloccante`);
  w();
  if (blocking.length) blocking.forEach((a) => w(`- ${a}`));
  else w(`_Nessun problema bloccante rilevato._`);
  w();
  w(`### 🟠 Importante`);
  w();
  if (important.length) important.forEach((a) => w(`- ${a}`));
  else w(`_Nessun problema importante rilevato._`);
  w();
  w(`### 🟡 Cosmetic`);
  w();
  if (cosmetic.length) cosmetic.forEach((a) => w(`- ${a}`));
  else w(`_Nessun problema cosmetic rilevato._`);
  w();

  w(`---`);
  w();
  w(`> Report generato in sola lettura. Le decisioni di migrazione sono demandate a un task successivo (dopo review). Rieseguibile con \`npx tsx scripts/generate-db-check-report.ts\`.`);
  w();

  writeFileSync(OUT, out.join("\n"), "utf8");
  console.log(`Report scritto in ${OUT} (${out.length} righe).`);
  console.log(`Azioni: ${blocking.length} bloccanti, ${important.length} importanti, ${cosmetic.length} cosmetic.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
