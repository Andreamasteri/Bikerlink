// Guardia CI/build: verifica che nessun file in migrations/ condivida lo
// stesso prefisso numerico con un altro. Due file con lo stesso numero (es.
// 0072_a.sql + 0072_b.sql) rendono l'ordine di applicazione ambiguo: il
// runner li ordina alfabeticamente, ma se una dipende dall'altra il risultato
// dipende dal nome — non dall'intenzione dello sviluppatore.
//
// Exit 0 → nessun duplicato nuovo (build OK)
// Exit 1 → duplicati NUOVI o baseline variata trovati (build bloccata)
// Exit 2 → errore lettura directory
//
// I duplicati storici noti sono allow-listati come insiemi ESATTI di filename
// in KNOWN_DUPLICATE_FILE_SETS (server/migration-prefix-guard.ts): solo il
// gruppo identico alla baseline produce un warning. Se un file viene aggiunto
// o rimosso il gruppo non combacia più → errore.
// Regola di naming: vedi migrations/README.md.
import { readdirSync } from "fs";
import { join } from "path";
import { assertNoDuplicateMigrationPrefixes } from "../migration-prefix-guard";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

export function validateMigrationFiles(files: readonly string[]): void {
  assertNoDuplicateMigrationPrefixes(files);
}

function main(): void {
  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
      .sort();
  } catch (e) {
    console.error(
      `[prefix-dup] impossibile leggere ${MIGRATIONS_DIR}:`,
      (e as Error).message,
    );
    process.exit(2);
  }

  try {
    validateMigrationFiles(files);
    console.log(
      `[prefix-dup] OK — ${files.length} file di migrazione, nessun prefisso numerico duplicato NUOVO.`,
    );
    process.exit(0);
  } catch (e) {
    console.error("[prefix-dup] PREFISSO NUMERICO DUPLICATO O BASELINE INCOMPLETA");
    console.error((e as Error).message);
    console.error("Regola di naming: vedi migrations/README.md.");
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("check-migration-prefix-duplicates.ts")) {
  main();
}
