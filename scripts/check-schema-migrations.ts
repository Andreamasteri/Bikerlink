/**
 * BikerLink — Verifica Schema vs Migrazioni Phase 1
 *
 * Controlla che ogni colonna definita nel Drizzle schema per le tabelle
 * critiche sia presente nel DB reale E coperta da una migrazione Phase 1
 * in server/index.ts.
 *
 * Exit 0 → tutto OK
 * Exit 1 → colonne mancanti nel DB (BUILD BLOCCATA)
 * Exit 0 con warning → colonne nel DB ma senza migrazione Phase 1 (rischioso)
 */

import { users, userProfiles, motoClubs } from "../shared/schema";
import { Client } from "pg";
import * as fs from "fs";

const TABLES_TO_CHECK = [
  { name: "users", schema: users },
  { name: "user_profiles", schema: userProfiles },
  { name: "moto_clubs", schema: motoClubs },
];

function getSchemaColumns(table: any): string[] {
  return Object.values(table)
    .filter(
      (v: any) =>
        v &&
        typeof v === "object" &&
        typeof v.name === "string" &&
        v.name.length > 0 &&
        !v.name.includes("(")
    )
    .map((v: any) => v.name as string);
}

function getMigratedColumns(tableName: string): Set<string> {
  const content = fs.readFileSync("server/index.ts", "utf-8");
  const regex = new RegExp(
    `ALTER\\s+TABLE\\s+${tableName}\\s+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+(\\w+)`,
    "gi"
  );
  const cols = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    cols.add(match[1].toLowerCase());
  }
  return cols;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("  ✖  DATABASE_URL non impostata — impossibile verificare il DB.");
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
  } catch (e: any) {
    console.error(`  ✖  Connessione DB fallita: ${e.message}`);
    process.exit(1);
  }

  let hasErrors = false;
  let hasWarnings = false;

  for (const { name, schema } of TABLES_TO_CHECK) {
    const schemaCols = getSchemaColumns(schema);
    const migratedCols = getMigratedColumns(name);

    let dbCols: Set<string>;
    try {
      const { rows } = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'",
        [name]
      );
      dbCols = new Set(rows.map((r: any) => r.column_name as string));
    } catch (e: any) {
      console.error(`  ✖  Errore query DB per tabella ${name}: ${e.message}`);
      hasErrors = true;
      continue;
    }

    const missingFromDb: string[] = [];
    const missingMigration: string[] = [];

    for (const col of schemaCols) {
      if (!dbCols.has(col)) {
        missingFromDb.push(col);
      } else if (!migratedCols.has(col)) {
        missingMigration.push(col);
      }
    }

    if (missingFromDb.length > 0) {
      console.error(`\n  ✖  ERRORE — tabella "${name}" — colonne nello schema ma ASSENTI nel DB:`);
      for (const col of missingFromDb) {
        console.error(`       • ${col}`);
      }
      console.error(`     → Aggiungere migrazione Phase 1 in server/index.ts e rieseguire db:push`);
      hasErrors = true;
    }

    if (missingMigration.length > 0) {
      console.warn(
        `\n  ⚠   ATTENZIONE — tabella "${name}" — colonne nel DB ma SENZA migrazione Phase 1:`
      );
      for (const col of missingMigration) {
        console.warn(`       • ${col}`);
      }
      console.warn(
        `     → Se sono colonne storiche (create al lancio) nessun problema.`
      );
      console.warn(
        `     → Se sono colonne nuove, aggiungere migrazione in server/index.ts!`
      );
      hasWarnings = true;
    }
  }

  await client.end();

  if (hasErrors) {
    console.error(
      "\n  ✖  BUILD BLOCCATA — colonne mancanti nel DB. Correggere prima di buildare."
    );
    process.exit(1);
  }

  if (hasWarnings) {
    console.warn(
      "\n  ⚠   Build consentita con avvisi. Verificare manualmente le colonne senza migrazione."
    );
  } else {
    console.log(
      "\n  ✔  Schema DB verificato — tutte le colonne critiche sono coperte."
    );
  }
}

main();
