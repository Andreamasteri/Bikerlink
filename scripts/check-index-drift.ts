/**
 * check-index-drift.ts
 *
 * Audit sistematico degli indici "speciali" (con ordinamento DESC o clausola
 * WHERE) usando lo schema Drizzle TS come source of truth.
 *
 * Fonti di informazione (in ordine di priorità):
 *   1. Schema Drizzle TS (shared/db/) — cosa DEVE esistere nel DB
 *   2. Migration SQL (migrations/) — crosscheck regressioni: un indice speciale
 *      che viene droppato e ricreato senza DESC/WHERE nelle migration è una
 *      regressione che andrà a generare DROP+CREATE a ogni push.
 *   3. pg_indexes live — verifica che il DB live corrisponda allo schema TS
 *
 * Le funzioni pure di analisi (lettura schema, parsing migration, verifica live)
 * vivono in scripts/index-drift-core.ts. Questo file contiene solo
 * l'orchestrazione e il logging.
 *
 * Exit code 0 → tutti gli indici speciali allineati, nessuna regressione nelle migration
 * Exit code 1 → drift REALE: regressione nelle migration SQL o mismatch con il DB live
 * Exit code 2 → DB non raggiungibile (connettività): la fase live è skippata, la fase
 *               statica (migration) era OK. Il deploy può continuare con un warning.
 *
 * Usage:
 *   npx tsx scripts/check-index-drift.ts
 *   npx tsx scripts/check-index-drift.ts --static-only
 *   npm run db:check-indexes
 */

import { Pool } from "pg";
import {
  type IndexDriftResult,
  getSchemaSpecialIndexes,
  getSchemaAllIndexes,
  detectMigrationRegressions,
  detectInverseDrift,
  fetchLiveIndexes,
  verifyLiveDef,
  normalizeSql,
} from "./index-drift-core";

export type { IndexDriftResult } from "./index-drift-core";

// ─── runIndexDriftCheck (importabile dal server al boot) ──────────────────────

/**
 * Esegue le tre fasi di verifica (schema TS → migration SQL → DB live) e
 * restituisce un risultato strutturato invece di chiamare process.exit().
 * Usato da server/boot-sequence.ts per la verifica post-boot non bloccante.
 */
export async function runIndexDriftCheck(): Promise<IndexDriftResult> {
  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  console.log("[INDEX-DRIFT]   BikerLink — Index Drift Check (DESC/WHERE)");
  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════\n");

  // Fase 1: Drizzle TS schema
  const schemaSpecial = getSchemaSpecialIndexes();
  const schemaAll = getSchemaAllIndexes();

  if (schemaSpecial.size === 0) {
    console.log("[INDEX-DRIFT]   Nessun indice speciale (DESC/WHERE) trovato nello schema Drizzle TS.");
    console.log("[INDEX-DRIFT]   RESULT: OK — 0 indici speciali da verificare");
    return { exitCode: 0, issues: [] };
  }

  console.log(`[INDEX-DRIFT]   Indici speciali dallo schema Drizzle TS: ${schemaSpecial.size}\n`);
  for (const idx of schemaSpecial.values()) {
    const tags: string[] = [];
    if (idx.hasDesc) tags.push(`DESC[${idx.descColumns.join(",")}]`);
    if (idx.hasWhere) tags.push("WHERE");
    console.log(`[INDEX-DRIFT]     • ${idx.indexName} (${idx.tableName}) [${tags.join(",")}]`);
  }

  let exitCode: 0 | 1 | 2 = 0;
  const allIssues: string[] = [];

  // Fase 2: Migration SQL — regressioni (schema vuole DESC ma migration ha perso DESC)
  console.log("\n[INDEX-DRIFT]   Analisi migration SQL per regressioni...");
  const regressions = detectMigrationRegressions(schemaSpecial);
  if (regressions.length === 0) {
    console.log("[INDEX-DRIFT]   ✔  Nessuna regressione nelle migration SQL");
  } else {
    exitCode = 1;
    for (const r of regressions) {
      const lost: string[] = [];
      if (r.lostDesc) lost.push("DESC perso");
      if (r.lostWhere) lost.push("WHERE perso");
      const msg = `"${r.indexName}": regressione in ${r.migration} — ${lost.join(", ")}`;
      console.log(`[INDEX-DRIFT]   ✖  ${msg}`);
      allIssues.push(msg);
    }
  }

  // Fase 2b: Inverse drift — migration ha DESC/WHERE ma schema TS è ASC/senza-clausola
  // Questa è la causa del loop DROP+CREATE a ogni deploy di Replit.
  console.log("[INDEX-DRIFT]   Analisi inverse drift (migration DESC ≠ schema ASC)...");
  const inverseDrifts = detectInverseDrift(schemaAll);
  if (inverseDrifts.length === 0) {
    console.log("[INDEX-DRIFT]   ✔  Nessun inverse drift rilevato");
  } else {
    exitCode = 1;
    for (const d of inverseDrifts) {
      const gained: string[] = [];
      if (d.migrationHasDesc) gained.push("migration DESC ma schema ASC");
      if (d.migrationHasWhere) gained.push("migration WHERE ma schema senza clausola");
      const msg = `"${d.indexName}": inverse drift in ${d.migration} — ${gained.join(", ")} → DROP+CREATE loop al deploy`;
      console.log(`[INDEX-DRIFT]   ✖  ${msg}`);
      allIssues.push(msg);
    }
  }

  // Fase 3: Live DB
  console.log("\n[INDEX-DRIFT]   Verifica nel DB live...\n");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const okLines: string[] = [];
  const driftLines: string[] = [];

  try {
    const liveMap = await fetchLiveIndexes(
      pool,
      [...schemaSpecial.keys()],
    );

    for (const idx of schemaSpecial.values()) {
      const liveRow = liveMap.get(idx.indexName);

      if (!liveRow) {
        exitCode = 1;
        const msg = `"${idx.indexName}" (${idx.tableName}): ASSENTE nel DB`;
        driftLines.push(msg);
        allIssues.push(msg);
        continue;
      }

      const problems = verifyLiveDef(idx, liveRow);
      if (problems.length > 0) {
        exitCode = 1;
        for (const p of problems) {
          const msg = `"${idx.indexName}" (${idx.tableName}): ${p}`;
          driftLines.push(`[INDEX-DRIFT]   ✖  ${msg}`);
          driftLines.push(`[INDEX-DRIFT]        schema TS : hasDesc=${idx.hasDesc} hasWhere=${idx.hasWhere} descCols=[${idx.descColumns.join(",")}]`);
          driftLines.push(`[INDEX-DRIFT]        DB live   : ${normalizeSql(liveRow.indexdef)}`);
          allIssues.push(msg);
        }
      } else {
        okLines.push(`[INDEX-DRIFT]   ✔  ${idx.indexName} (${idx.tableName})`);
      }
    }
  } catch (err) {
    console.error("[INDEX-DRIFT]   WARN: impossibile connettersi al DB (connectivity) — fase live skippata.", err);
    await pool.end();
    // Exit 2 = DB irraggiungibile.
    // ATTENZIONE: se la fase statica ha già trovato regressioni (exitCode=1),
    // manteniamo exit 1 — il gate duro non va ammorbidito da un errore di connettività.
    return { exitCode: exitCode === 1 ? 1 : 2, issues: allIssues };
  }

  await pool.end();

  if (okLines.length > 0) {
    console.log("[INDEX-DRIFT]   Indici allineati con il DB live:");
    okLines.forEach((l) => console.log(l));
  }

  if (driftLines.length > 0) {
    console.log("[INDEX-DRIFT]\n  Drift nel DB live:");
    driftLines.forEach((l) => console.log(l));
  }

  console.log(`[INDEX-DRIFT] ══════════════════════════════════════════════`);
  if (exitCode !== 0) {
    console.log(
      `[INDEX-DRIFT]   RESULT: PROBLEMI (${allIssues.length}) — migration correttiva o fix schema TS richiesti`,
    );
    console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  } else {
    console.log(
      `[INDEX-DRIFT]   RESULT: OK — ${okLines.length} indici speciali allineati, nessun drift, nessuna regressione`,
    );
    console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  }

  return { exitCode, issues: allIssues };
}

// ─── runStaticIndexDriftCheck (fasi 1+2, no DB live) ──────────────────────────

/**
 * Esegue solo le fasi 1+2 (schema TS + migration SQL), senza connettersi
 * al DB live. Usato da deploy-build.sh dove il DB live è in uno stato
 * pre-migration e non rappresenta la realtà post-deploy.
 * Exit 0 = nessuna regressione · Exit 1 = regressione rilevata nelle migration
 */
export async function runStaticIndexDriftCheck(): Promise<IndexDriftResult> {
  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  console.log("[INDEX-DRIFT]   BikerLink — Index Drift Check (statico, no DB live)");
  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════\n");

  const schemaSpecial = getSchemaSpecialIndexes();
  const schemaAll = getSchemaAllIndexes();

  if (schemaSpecial.size === 0) {
    console.log("[INDEX-DRIFT]   Nessun indice speciale (DESC/WHERE) trovato nello schema Drizzle TS.");
    console.log("[INDEX-DRIFT]   RESULT: OK — 0 indici speciali da verificare");
    return { exitCode: 0, issues: [] };
  }

  console.log(`[INDEX-DRIFT]   Indici speciali dallo schema Drizzle TS: ${schemaSpecial.size}`);
  for (const idx of schemaSpecial.values()) {
    const tags: string[] = [];
    if (idx.hasDesc) tags.push(`DESC[${idx.descColumns.join(",")}]`);
    if (idx.hasWhere) tags.push("WHERE");
    console.log(`[INDEX-DRIFT]     • ${idx.indexName} (${idx.tableName}) [${tags.join(",")}]`);
  }

  const issues: string[] = [];

  // Fase 2: regressioni (schema vuole DESC ma migration ha perso DESC)
  console.log("\n[INDEX-DRIFT]   Analisi migration SQL per regressioni...");
  const regressions = detectMigrationRegressions(schemaSpecial);
  if (regressions.length === 0) {
    console.log("[INDEX-DRIFT]   ✔  Nessuna regressione nelle migration SQL");
  } else {
    for (const r of regressions) {
      const lost: string[] = [];
      if (r.lostDesc) lost.push("DESC perso");
      if (r.lostWhere) lost.push("WHERE perso");
      const msg = `"${r.indexName}": regressione in ${r.migration} — ${lost.join(", ")}`;
      console.log(`[INDEX-DRIFT]   ✖  ${msg}`);
      issues.push(msg);
    }
  }

  // Fase 2b: inverse drift (migration DESC ma schema ASC → loop DROP+CREATE al deploy)
  console.log("[INDEX-DRIFT]   Analisi inverse drift (migration DESC ≠ schema ASC)...");
  const inverseDrifts = detectInverseDrift(schemaAll);
  if (inverseDrifts.length === 0) {
    console.log("[INDEX-DRIFT]   ✔  Nessun inverse drift rilevato");
  } else {
    for (const d of inverseDrifts) {
      const gained: string[] = [];
      if (d.migrationHasDesc) gained.push("migration DESC ma schema ASC");
      if (d.migrationHasWhere) gained.push("migration WHERE ma schema senza clausola");
      const msg = `"${d.indexName}": inverse drift in ${d.migration} — ${gained.join(", ")} → DROP+CREATE loop al deploy`;
      console.log(`[INDEX-DRIFT]   ✖  ${msg}`);
      issues.push(msg);
    }
  }

  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  if (issues.length === 0) {
    console.log(`[INDEX-DRIFT]   RESULT: OK — nessuna regressione e nessun inverse drift, verifica live al boot`);
    console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
    return { exitCode: 0, issues: [] };
  }
  console.log(`[INDEX-DRIFT]   RESULT: PROBLEMI (${issues.length}) — migration correttiva o fix schema TS richiesti`);
  console.log("[INDEX-DRIFT] ══════════════════════════════════════════════");
  return { exitCode: 1, issues };
}

// ─── main (standalone CLI) ───────────────────────────────────────────────────

async function main() {
  const staticOnly = process.argv.includes("--static-only");
  const result = staticOnly
    ? await runStaticIndexDriftCheck()
    : await runIndexDriftCheck();
  process.exit(result.exitCode);
}

// Guard: esegui main() solo quando il file è lanciato direttamente come CLI
// (npx tsx scripts/check-index-drift.ts), NON quando viene importato dal bundle
// esbuild (server_dist/index.js). `require.main === module` non funziona in
// esbuild __esm context; usiamo process.argv[1] che include il nome del file
// quando lanciato direttamente, e non lo include nel bundle del server.
if (process.argv[1] && process.argv[1].includes("check-index-drift")) {
  main();
}
