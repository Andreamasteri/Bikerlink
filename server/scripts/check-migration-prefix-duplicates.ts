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
import {
  KNOWN_DUPLICATE_FILE_SETS,
  findDuplicateMigrationPrefixes,
} from "../migration-prefix-guard";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

function isExactKnownGroup(prefix: string, group: readonly string[]): boolean {
  const known = KNOWN_DUPLICATE_FILE_SETS.get(prefix);
  if (!known) return false;
  if (group.length !== known.size) return false;
  return group.every((f) => known.has(f));
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

  const dups = findDuplicateMigrationPrefixes(files);

  const known: Array<[string, string[]]> = [];
  const newDups: Array<[string, string[]]> = [];
  for (const [prefix, group] of dups) {
    if (isExactKnownGroup(prefix, group)) {
      known.push([prefix, group]);
    } else {
      newDups.push([prefix, group]);
    }
  }

  if (known.length) {
    console.log(
      `[prefix-dup] duplicati noti (baseline esatta, non bloccanti): ${known.length}`,
    );
    for (const [prefix, group] of known) {
      console.log(`  • ${prefix}: ${group.join(", ")}`);
    }
  }

  if (newDups.length === 0) {
    console.log(
      `[prefix-dup] OK — ${files.length} file di migrazione, nessun prefisso numerico duplicato NUOVO.`,
    );
    process.exit(0);
  }

  console.error("──────────────────────────────────────────────────────────────");
  console.error("[prefix-dup] PREFISSO NUMERICO DUPLICATO RILEVATO");
  console.error("Due o più file in migrations/ condividono lo stesso numero,");
  console.error("oppure un gruppo storico noto è cambiato (file aggiunti/rimossi).");
  console.error("L'ordine di applicazione è ambiguo e soggetto a errori futuri.");
  console.error("──────────────────────────────────────────────────────────────");
  for (const [prefix, group] of newDups) {
    console.error(`\n  Prefisso ${prefix}:`);
    for (const f of group) console.error(`    • ${f}`);
    const known = KNOWN_DUPLICATE_FILE_SETS.get(prefix);
    if (known) {
      console.error(`  (baseline attesa per ${prefix}:)`);
      for (const f of known) console.error(`    ○ ${f}`);
    }
  }
  console.error(
    "\nAzione: rinomina uno dei file al prossimo numero libero (NNNN_*.sql).",
  );
  console.error("Regola di naming: vedi migrations/README.md.");
  console.error(
    "(Se il duplicato è già applicato in prod e non può essere rinominato,",
  );
  console.error(
    " aggiungilo a KNOWN_DUPLICATE_FILE_SETS in server/migration-prefix-guard.ts",
  );
  console.error(
    " con l'insieme ESATTO dei filename attesi per quel prefisso.)",
  );
  process.exit(1);
}

main();
