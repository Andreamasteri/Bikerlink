// Scaffolder locale per una NUOVA migration con prefisso numerico SICURO.
//
// Perché esiste: scegliere il numero a mano (`ls migrations | sort | tail`) è
// soggetto a errore — due file possono finire sullo stesso prefisso e questo
// crash-loopa il backend al boot (la guardia fatale in server/migrate.ts lo
// prende, ma solo DOPO che la collisione è già stata introdotta). Questo script
// calcola il prossimo numero libero (max esistente + 1) e crea il file, così una
// collisione è impossibile per costruzione. Verifica anche l'intera cartella con
// la stessa logica del boot guard, in modo da fallire subito se qualcosa non va.
//
// Uso:
//   npx tsx scripts/new-migration.ts <descrizione_snake_case>
//   npx tsx scripts/new-migration.ts add_sos_events
//
// Senza argomenti stampa solo il prossimo numero libero (dry-run, non crea nulla):
//   npx tsx scripts/new-migration.ts
//
// Exit 0 → file creato (o prossimo numero stampato in dry-run)
// Exit 1 → errore (descrizione non valida, collisione rilevata, IO)
import { readdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  migrationPrefix,
  findDuplicateMigrationPrefixes,
  KNOWN_DUPLICATE_FILE_SETS,
} from "../server/migration-prefix-guard";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

function readMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
    .sort();
}

/** Prossimo prefisso libero = (max prefisso numerico esistente + 1), zero-padded. */
export function nextPrefix(files: readonly string[]): string {
  let max = -1;
  let width = 4;
  for (const f of files) {
    const p = migrationPrefix(f);
    if (!p) continue;
    width = Math.max(width, p.length);
    const n = Number.parseInt(p, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(width, "0");
}

export function sanitizeDescription(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Ritorna i gruppi duplicati NON riconducibili alla baseline nota (array
 * vuoto = cartella sana). Funzione pura, testabile senza process.exit.
 */
export function findUnknownDuplicates(
  files: readonly string[],
): Array<[string, string[]]> {
  const dups = findDuplicateMigrationPrefixes(files);
  const offending: Array<[string, string[]]> = [];
  for (const [prefix, group] of dups) {
    const known = KNOWN_DUPLICATE_FILE_SETS.get(prefix);
    const isExactKnown =
      known != null &&
      group.length === known.size &&
      group.every((f) => known.has(f));
    if (!isExactKnown) offending.push([prefix, group]);
  }
  return offending;
}

/** Fallisce se la cartella contiene un duplicato NON riconducibile alla baseline. */
function assertNoUnknownDuplicates(files: readonly string[]): void {
  const offending = findUnknownDuplicates(files);
  if (offending.length === 0) return;
  console.error(
    "[new-migration] ATTENZIONE: la cartella migrations/ contiene già un prefisso duplicato:",
  );
  for (const [prefix, group] of offending) {
    console.error(`  • ${prefix}: ${group.join(", ")}`);
  }
  console.error(
    "Risolvi il duplicato esistente prima di aggiungere una nuova migration.",
  );
  process.exit(1);
}

function main(): void {
  let files: string[];
  try {
    files = readMigrationFiles();
  } catch (e) {
    console.error(
      `[new-migration] impossibile leggere ${MIGRATIONS_DIR}:`,
      (e as Error).message,
    );
    process.exit(1);
  }

  // La cartella deve essere sana PRIMA di aggiungere altro.
  assertNoUnknownDuplicates(files);

  const prefix = nextPrefix(files);
  const rawDesc = process.argv.slice(2).join(" ");

  // Dry-run: nessuna descrizione → stampa solo il prossimo numero libero.
  if (!rawDesc) {
    console.log(
      `[new-migration] prossimo numero libero: ${prefix}\n` +
        `Uso: npx tsx scripts/new-migration.ts <descrizione_snake_case>\n` +
        `Esempio: npx tsx scripts/new-migration.ts add_sos_events  →  ${prefix}_add_sos_events.sql`,
    );
    process.exit(0);
  }

  const desc = sanitizeDescription(rawDesc);
  if (!desc) {
    console.error(
      "[new-migration] descrizione non valida: usa snake_case (a-z, 0-9, _).",
    );
    process.exit(1);
  }

  const filename = `${prefix}_${desc}.sql`;
  const fullPath = join(MIGRATIONS_DIR, filename);

  if (existsSync(fullPath)) {
    console.error(`[new-migration] il file esiste già: ${filename}`);
    process.exit(1);
  }

  const template =
    `-- ${filename}\n` +
    `-- Migration idempotente: usa IF NOT EXISTS / IF EXISTS dove possibile.\n` +
    `-- Regola di naming: un numero = un file (vedi migrations/README.md).\n\n`;

  writeFileSync(fullPath, template, { encoding: "utf8", flag: "wx" });

  // Post-verifica: la cartella deve restare senza duplicati sconosciuti.
  assertNoUnknownDuplicates(readMigrationFiles());

  console.log(`[new-migration] creata migrations/${filename}`);
}

// Esegue main() solo quando lo script è invocato direttamente (CLI), non
// quando i suoi helper puri vengono importati da un test.
const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main();
}
