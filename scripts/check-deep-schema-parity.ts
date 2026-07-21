/**
 * check-deep-schema-parity.ts
 *
 * Deep Schema Parity Guard (dev ↔ prod).
 *
 * Le guardie esistenti (scripts/check-schema-drift.ts, server/scripts/
 * check-schema-migration-drift.ts, server/ai/db-integrity/checks/schema-registry.ts)
 * confrontano lo schema SOLO a livello di NOMI (tabelle, colonne, indici,
 * nullability). Questo strumento chiude il blind spot: confronta la DEFINIZIONE
 * COMPLETA di due database calcolando una firma (hash) per ciascuna di 7
 * categorie e scendendo al dettaglio del singolo oggetto quando una firma non
 * combacia.
 *
 * Categorie di firma (tutte da pg_catalog, sola lettura):
 *   1. columns      — tipo completo + nullability + default + identity + collation
 *   2. constraints  — PK/FK/UNIQUE/CHECK/EXCLUDE via pg_get_constraintdef()
 *   3. indexes      — definizione completa via pg_get_indexdef() (incl. DESC/predicate/opclass)
 *   4. enums        — label + ordine (enumsortorder)
 *   5. triggers     — definizione completa via pg_get_triggerdef()
 *   6. extensions   — nome + versione
 *   7. sequences    — tipo + start/increment/min/max/cache/cycle
 *
 * USO
 *   # cattura le firme da un DB e le scrive in un file JSON
 *   npx tsx scripts/check-deep-schema-parity.ts capture [--url <conn>] [--out <file>]
 *
 *   # confronta due sorgenti (ciascuna: percorso .json | connection string | env:VAR)
 *   npx tsx scripts/check-deep-schema-parity.ts compare <source> <target>
 *
 *   # default: confronta DATABASE_URL (dev) con $COMPARE_DATABASE_URL (o un
 *   #          baseline file server/data/deep-schema-parity.prod.json se presente)
 *   npx tsx scripts/check-deep-schema-parity.ts
 *
 * COME OTTENERE LE FIRME DI PRODUZIONE SU REPLIT
 *   Replit NON espone una connection string per la replica di produzione: la prod
 *   è interrogabile solo in sola-lettura tramite il pannello/skill database. Per
 *   confrontare dev↔prod, cattura le firme prod (eseguendo le stesse SELECT di
 *   questo file contro la replica prod) in un JSON con la stessa forma prodotta da
 *   `capture`, poi lancia `compare <dev-conn> <prod.json>`.
 *
 * ESITO
 *   exit 0 → in sync (l'unica differenza è nell'allow-list documentata)
 *   exit 1 → drift di DEFINIZIONE nuovo rilevato (report dettagliato per categoria)
 *   exit 2 → errore d'uso / DB irraggiungibile
 */

import { Pool } from "pg";
import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── tipi ────────────────────────────────────────────────────────────────────

type Category =
  | "columns"
  | "constraints"
  | "indexes"
  | "enums"
  | "triggers"
  | "extensions"
  | "sequences";

interface Entry {
  /** chiave canonica dell'oggetto (es. "users.email" o "postgis"). */
  key: string;
  /** firma testuale completa dell'oggetto (deparse normalizzato). */
  def: string;
}

interface Capture {
  version: 1;
  capturedAt: string;
  label: string;
  categories: Record<Category, Entry[]>;
  hashes: Record<Category, string> & { overall: string };
}

// ─── query di firma (sola lettura, pg_catalog) ───────────────────────────────
// Ogni query restituisce due colonne testuali: "key" e "def". L'ORDER BY rende
// la cattura deterministica così l'hash non dipende dall'ordine fisico.

const SIGNATURE_QUERIES: ReadonlyArray<{ category: Category; sql: string }> = [
  {
    category: "columns",
    // Tipo completo (format_type include length/precision), nullability, default,
    // identity (a/d/'' ), collation. Solo tabelle ordinarie/partizionate.
    sql: `
      SELECT (c.relname || '.' || a.attname) AS key,
             format_type(a.atttypid, a.atttypmod)
               || ' notnull=' || a.attnotnull::text
               || ' default=' || COALESCE(pg_get_expr(ad.adbin, ad.adrelid), '')
               || ' identity=' || COALESCE(NULLIF(a.attidentity::text, ''), '-')
               || ' collation=' || COALESCE(co.collname, '-') AS def
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      LEFT JOIN pg_catalog.pg_collation co ON co.oid = a.attcollation
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY key`,
  },
  {
    category: "constraints",
    // PK / FK / UNIQUE / CHECK / EXCLUDE — definizione canonica via deparse.
    sql: `
      SELECT (rel.relname || '.' || con.conname) AS key,
             pg_get_constraintdef(con.oid) AS def
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY key`,
  },
  {
    category: "indexes",
    // Definizione completa: cattura DESC, WHERE (predicate parziale), opclass,
    // espressioni — tutto ciò che il confronto per nome non vede.
    sql: `
      SELECT (t.relname || '.' || i.relname) AS key,
             pg_get_indexdef(ix.indexrelid) AS def
      FROM pg_catalog.pg_index ix
      JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
      JOIN pg_catalog.pg_class t ON t.oid = ix.indrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY key`,
  },
  {
    category: "enums",
    // Etichette in ordine (enumsortorder): cattura sia un label aggiunto sia un
    // riordino delle etichette esistenti.
    sql: `
      SELECT t.typname AS key,
             string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS def
      FROM pg_catalog.pg_type t
      JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY key`,
  },
  {
    category: "triggers",
    // Definizione completa via deparse; esclude i trigger interni di sistema
    // (es. quelli generati dai FK constraint) per non duplicare i constraint.
    sql: `
      SELECT (rel.relname || '.' || tg.tgname) AS key,
             pg_get_triggerdef(tg.oid) AS def
      FROM pg_catalog.pg_trigger tg
      JOIN pg_catalog.pg_class rel ON rel.oid = tg.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = 'public'
        AND NOT tg.tgisinternal
      ORDER BY key`,
  },
  {
    category: "extensions",
    // Nome + versione installata.
    sql: `
      SELECT e.extname AS key, e.extversion AS def
      FROM pg_catalog.pg_extension e
      ORDER BY key`,
  },
  {
    category: "sequences",
    // Tipo e parametri completi della sequenza.
    sql: `
      SELECT c.relname AS key,
             format_type(s.seqtypid, NULL)
               || ' start=' || s.seqstart::text
               || ' inc=' || s.seqincrement::text
               || ' min=' || s.seqmin::text
               || ' max=' || s.seqmax::text
               || ' cache=' || s.seqcache::text
               || ' cycle=' || s.seqcycle::text AS def
      FROM pg_catalog.pg_sequence s
      JOIN pg_catalog.pg_class c ON c.oid = s.seqrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY key`,
  },
];

const CATEGORIES: Category[] = SIGNATURE_QUERIES.map((q) => q.category);

// ─── allow-list di eccezioni note e NON fixabili ─────────────────────────────
// Queste differenze esistono SOLO confrontando dev↔prod e NON sono correggibili
// dal nostro codice (sono interne a Replit/PostGIS o effetto della diversa
// versione di PostGIS). Sono allow-listate per OGGETTO SPECIFICO (mai per intera
// categoria) così lo strumento resta verde sul drift noto MA continua a bloccare
// ogni NUOVO drift di definizione.
//
// Formato chiave: "<categoria>:<key>" dove <key> è la stessa chiave canonica
// emessa dalle query di firma (es. "extensions:postgis").
const ALLOWLIST = new Set<string>([
  // 1) spatial_ref_sys_pkey — la PRIMARY KEY su spatial_ref_sys (tabella di
  //    sistema PostGIS, di proprietà di cloud_admin) viene aggiunta INTERNAMENTE
  //    da Replit/PostGIS al momento del publish. È presente in prod ma assente in
  //    dev. Non possiamo (né dobbiamo) crearla noi: non siamo owner della tabella.
  "constraints:spatial_ref_sys.spatial_ref_sys_pkey",
  // 1b) L'indice UNIQUE che fa da backing alla PK di cui sopra. Postgres lo crea
  //     automaticamente insieme alla PRIMARY KEY, quindi è presente in prod e
  //     assente in dev per lo stesso identico motivo (oggetto interno PostGIS/Replit).
  "indexes:spatial_ref_sys.spatial_ref_sys_pkey",

  // 2) Versione PostGIS — prod 3.3.3 vs dev 3.5.3. È un aggiornamento di estensione
  //    gestito dall'infrastruttura Replit: non aggiornabile via codice né via
  //    publish (la replica prod è read-only e il publish non aggiorna le estensioni).
  //    Vedi "Out of scope" del task: eventuale ticket a Replit support.
  "extensions:postgis",

  // 3) Rendering cosmetico del CHECK user_sessions_exit_type — la diversa versione
  //    di PostGIS cambia il deparse del CHECK (`= ANY (ARRAY[...]::text[])` vs
  //    `::text` per elemento). È SEMANTICAMENTE IDENTICO: stesso insieme di valori
  //    ammessi, solo una resa testuale differente del medesimo vincolo.
  //    Si allow-listano entrambe le possibili rese del nome del constraint
  //    (_check generato da Postgres, _chk se rinominato esplicitamente).
  "constraints:user_sessions.user_sessions_exit_type_check",
  "constraints:user_sessions.user_sessions_exit_type_chk",
]);

// ─── helpers di cattura ──────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Calcola l'hash canonico di una categoria (entries già ordinate per key). */
function categoryHash(entries: Entry[]): string {
  return sha256(entries.map((e) => `${e.key}\u0000${e.def}`).join("\n"));
}

function buildCapture(
  label: string,
  byCategory: Record<Category, Entry[]>,
): Capture {
  const hashes = {} as Capture["hashes"];
  const overallParts: string[] = [];
  for (const cat of CATEGORIES) {
    const h = categoryHash(byCategory[cat]);
    hashes[cat] = h;
    overallParts.push(`${cat}:${h}`);
  }
  hashes.overall = sha256(overallParts.join("\n"));
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    label,
    categories: byCategory,
    hashes,
  };
}

async function captureFromConnString(conn: string, label: string): Promise<Capture> {
  const pool = new Pool({ connectionString: conn });
  try {
    const byCategory = {} as Record<Category, Entry[]>;
    for (const { category, sql } of SIGNATURE_QUERIES) {
      const res = await pool.query<{ key: string; def: string | null }>(sql);
      byCategory[category] = res.rows.map((r) => ({
        key: r.key,
        def: r.def ?? "",
      }));
    }
    return buildCapture(label, byCategory);
  } finally {
    await pool.end();
  }
}

function loadCaptureFile(path: string): Capture {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Capture>;
  if (!raw || raw.version !== 1 || !raw.categories) {
    throw new Error(`File firme non valido o non riconosciuto: ${path}`);
  }
  // Ricalcola gli hash dalle categories per robustezza (il file potrebbe essere
  // stato prodotto da una cattura prod manuale senza il blocco hashes).
  return buildCapture(raw.label ?? path, raw.categories as Record<Category, Entry[]>);
}

/**
 * Risolve una "sorgente" CLI in una Capture.
 *   - "env:VAR"                → connection string da env
 *   - "postgres://" / "postgresql://" → connection string diretta
 *   - "*.json" o file esistente → file di firme catturato
 */
async function resolveSource(arg: string): Promise<Capture> {
  if (arg.startsWith("env:")) {
    const varName = arg.slice(4);
    const conn = process.env[varName];
    if (!conn) throw new Error(`Variabile d'ambiente non impostata: ${varName}`);
    return captureFromConnString(conn, varName);
  }
  if (arg.startsWith("postgres://") || arg.startsWith("postgresql://")) {
    return captureFromConnString(arg, redactConn(arg));
  }
  if (arg.endsWith(".json") || existsSync(arg)) {
    return loadCaptureFile(arg);
  }
  throw new Error(
    `Sorgente non riconosciuta: "${arg}". Attesi: env:VAR | postgres://... | percorso .json`,
  );
}

/** Nasconde le credenziali da una connection string per i log. */
function redactConn(conn: string): string {
  try {
    const u = new URL(conn);
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch {
    return "db";
  }
}

// ─── diff ────────────────────────────────────────────────────────────────────

interface CategoryDiff {
  onlyInSource: Entry[];
  onlyInTarget: Entry[];
  changed: Array<{ key: string; source: string; target: string }>;
}

function diffCategory(source: Entry[], target: Entry[]): CategoryDiff {
  const a = new Map(source.map((e) => [e.key, e.def]));
  const b = new Map(target.map((e) => [e.key, e.def]));
  const onlyInSource: Entry[] = [];
  const onlyInTarget: Entry[] = [];
  const changed: CategoryDiff["changed"] = [];
  for (const [key, def] of a) {
    if (!b.has(key)) onlyInSource.push({ key, def });
    else if (b.get(key) !== def) changed.push({ key, source: def, target: b.get(key)! });
  }
  for (const [key, def] of b) {
    if (!a.has(key)) onlyInTarget.push({ key, def });
  }
  return { onlyInSource, onlyInTarget, changed };
}

interface ParityResult {
  ok: boolean;
  /** differenze NUOVE per categoria (allow-list già rimossa). */
  diffs: Record<Category, CategoryDiff>;
  /** voci allow-listate che hanno effettivamente prodotto una differenza. */
  knownHits: string[];
}

function isAllowed(cat: Category, key: string): boolean {
  return ALLOWLIST.has(`${cat}:${key}`);
}

function compareCaptures(source: Capture, target: Capture): ParityResult {
  const diffs = {} as Record<Category, CategoryDiff>;
  const knownHits: string[] = [];
  let ok = true;

  for (const cat of CATEGORIES) {
    const raw = diffCategory(source.categories[cat], target.categories[cat]);

    const filterAllowed = <T extends { key: string }>(items: T[]): T[] =>
      items.filter((it) => {
        if (isAllowed(cat, it.key)) {
          knownHits.push(`${cat}:${it.key}`);
          return false;
        }
        return true;
      });

    const filtered: CategoryDiff = {
      onlyInSource: filterAllowed(raw.onlyInSource),
      onlyInTarget: filterAllowed(raw.onlyInTarget),
      changed: filterAllowed(raw.changed),
    };
    diffs[cat] = filtered;
    if (
      filtered.onlyInSource.length ||
      filtered.onlyInTarget.length ||
      filtered.changed.length
    ) {
      ok = false;
    }
  }

  // dedup knownHits (una stessa voce non può comparire due volte, ma per sicurezza)
  return { ok, diffs, knownHits: [...new Set(knownHits)] };
}

// ─── reportistica ────────────────────────────────────────────────────────────

const SOURCE_LABEL = "source";
const TARGET_LABEL = "target";

function truncate(s: string, max = 200): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function printResult(source: Capture, target: Capture, result: ParityResult): void {
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  BikerLink — Deep Schema Parity Guard (dev ↔ prod)");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  ${SOURCE_LABEL}: ${source.label}  (overall ${source.hashes.overall.slice(0, 12)})`);
  console.log(`  ${TARGET_LABEL}: ${target.label}  (overall ${target.hashes.overall.slice(0, 12)})`);

  console.log("\n  Firme per categoria (source → target):");
  for (const cat of CATEGORIES) {
    const same = source.hashes[cat] === target.hashes[cat];
    const mark = same ? "✔" : "✖";
    console.log(
      `    ${mark} ${cat.padEnd(12)} ${source.hashes[cat].slice(0, 10)} → ${target.hashes[cat].slice(0, 10)}`,
    );
  }

  if (result.knownHits.length) {
    console.log(
      `\n[deep-parity] differenze note (allow-list, non bloccanti): ${result.knownHits.length}`,
    );
    for (const k of result.knownHits) console.log(`  • ${k}`);
  }

  if (result.ok) {
    console.log("\n══════════════════════════════════════════════════════════════");
    console.log(
      "  RESULT: IN SYNC — nessun NUOVO drift di definizione (solo eccezioni note)",
    );
    console.log("══════════════════════════════════════════════════════════════");
    return;
  }

  console.error("\n──────────────────────────────────────────────────────────────");
  console.error("[deep-parity] NUOVO DRIFT DI DEFINIZIONE RILEVATO");
  console.error("──────────────────────────────────────────────────────────────");

  for (const cat of CATEGORIES) {
    const d = result.diffs[cat];
    if (!d.onlyInSource.length && !d.onlyInTarget.length && !d.changed.length) continue;
    console.error(`\n[${cat}]`);
    for (const e of d.onlyInSource) {
      console.error(`  − solo in ${SOURCE_LABEL}: ${e.key}`);
      console.error(`      ${truncate(e.def)}`);
    }
    for (const e of d.onlyInTarget) {
      console.error(`  + solo in ${TARGET_LABEL}: ${e.key}`);
      console.error(`      ${truncate(e.def)}`);
    }
    for (const c of d.changed) {
      console.error(`  ≠ definizione diversa: ${c.key}`);
      console.error(`      ${SOURCE_LABEL}: ${truncate(c.source)}`);
      console.error(`      ${TARGET_LABEL}: ${truncate(c.target)}`);
    }
  }

  console.error(
    "\nAzione: se la differenza è reale, allinea lo schema (migration numerata in",
  );
  console.error(
    "migrations/ per il drift dev→prod, o aggiorna il registry). Se è una nuova",
  );
  console.error("eccezione infrastrutturale NON fixabile, aggiungila ad ALLOWLIST con commento.");
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const DEFAULT_PROD_BASELINE = "server/data/deep-schema-parity.prod.json";

function getFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

async function runCapture(argv: string[]): Promise<number> {
  const url = getFlag(argv, "--url") ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("[deep-parity] manca --url o DATABASE_URL per la cattura.");
    return 2;
  }
  const out = getFlag(argv, "--out");
  const capture = await captureFromConnString(url, getFlag(argv, "--label") ?? redactConn(url));
  const json = JSON.stringify(capture, null, 2);
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, json, "utf8");
    console.log(`[deep-parity] firme catturate (${capture.label}) → ${out}`);
    console.log(`[deep-parity] overall hash: ${capture.hashes.overall}`);
  } else {
    console.log(json);
  }
  return 0;
}

async function runCompare(sourceArg: string, targetArg: string): Promise<number> {
  const source = await resolveSource(sourceArg);
  const target = await resolveSource(targetArg);
  const result = compareCaptures(source, target);
  printResult(source, target, result);
  return result.ok ? 0 : 1;
}

async function runDefault(): Promise<number> {
  const dev = process.env.DATABASE_URL;
  if (!dev) {
    console.error("[deep-parity] DATABASE_URL non impostata.");
    return 2;
  }
  const compareUrl = process.env.COMPARE_DATABASE_URL;
  let targetArg: string | undefined;
  if (compareUrl) targetArg = compareUrl;
  else if (existsSync(DEFAULT_PROD_BASELINE)) targetArg = DEFAULT_PROD_BASELINE;

  if (!targetArg) {
    console.error("──────────────────────────────────────────────────────────────");
    console.error("[deep-parity] Nessun target di confronto disponibile.");
    console.error("──────────────────────────────────────────────────────────────");
    console.error("Fornisci uno di:");
    console.error("  • env COMPARE_DATABASE_URL con la connection string del target");
    console.error(`  • un file baseline a ${DEFAULT_PROD_BASELINE} (firme prod catturate)`);
    console.error("  • oppure usa la modalità esplicita: compare <source> <target>");
    console.error("\nSu Replit la prod non ha connection string: cattura le firme prod");
    console.error("con la skill database (sola lettura) in un JSON e confrontalo con `compare`.");
    return 2;
  }
  return runCompare(dev, targetArg);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  let code: number;
  try {
    if (cmd === "capture") {
      code = await runCapture(argv.slice(1));
    } else if (cmd === "compare") {
      const positional = argv.slice(1).filter((a) => !a.startsWith("--"));
      if (positional.length < 2) {
        console.error("Uso: compare <source> <target>");
        console.error("  source/target: env:VAR | postgres://... | percorso .json");
        code = 2;
      } else {
        code = await runCompare(positional[0], positional[1]);
      }
    } else if (!cmd) {
      code = await runDefault();
    } else {
      console.error(`Comando sconosciuto: "${cmd}". Usa: capture | compare | (nessuno).`);
      code = 2;
    }
  } catch (err) {
    console.error("[deep-parity] ERRORE:", (err as Error).message);
    code = 2;
  }
  process.exit(code);
}

main();
