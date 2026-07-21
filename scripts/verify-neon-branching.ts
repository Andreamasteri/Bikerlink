/**
 * verify-neon-branching.ts — Task #1032
 *
 * Verifica che dev e prod puntino a branch Neon SEPARATI.
 * Parsing-only: non apre connessioni TCP.
 *
 * Condizioni verificate:
 *   (a) DATABASE_URL_DEV è impostato
 *   (b) entrambi i connection string contengono "neon.tech"
 *   (c) gli host dei due branch sono DIVERSI (branch separati)
 *   (d) il dbname coincide (stesso progetto Neon)
 *
 * Esecuzione:
 *   npx tsx scripts/verify-neon-branching.ts
 *   npm run check:neon-branch
 *
 * Exit code:
 *   0 → OK — branch separati confermati
 *   1 → FAIL — guard non superato (messaggio specifico stampato su stderr)
 */

function parseConnectionString(raw: string): { host: string; dbname: string } | null {
  try {
    const u = new URL(raw);
    const host = u.hostname;
    // dbname is the pathname minus leading slash
    const dbname = u.pathname.replace(/^\//, "").split("?")[0] ?? "";
    if (!host) return null;
    return { host, dbname };
  } catch {
    return null;
  }
}

function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Keep host visible; redact user/password/path details
    return `${u.protocol}//<redacted>@${u.host}${u.pathname}`;
  } catch {
    return "<non-parseable URL>";
  }
}

function main(): void {
  const LINE = "═".repeat(62);
  console.log(`\n${LINE}`);
  console.log("  verify-neon-branching — Neon DB branching guard");
  console.log(LINE);

  const devUrl = process.env.DATABASE_URL_DEV;
  const prodUrl = process.env.DATABASE_URL;

  // ── Check (a): DATABASE_URL_DEV deve essere impostato ────────────────────────
  if (!devUrl) {
    console.error("\n  ✗ DATABASE_URL_DEV non impostato.");
    console.error("    Questo variable deve puntare al branch Neon di sviluppo.");
    console.error("    Senza di esso, drizzle-kit e gli script di workspace");
    console.error("    potrebbero colpire accidentalmente il branch di produzione.");
    console.error(`\n${LINE}`);
    console.error("  ❌ GUARD FALLITO — DATABASE_URL_DEV mancante");
    console.error(`${LINE}\n`);
    process.exit(1);
  }

  if (!prodUrl) {
    console.error("\n  ✗ DATABASE_URL non impostato.");
    console.error("    DATABASE_URL deve puntare al branch Neon di produzione.");
    console.error(`\n${LINE}`);
    console.error("  ❌ GUARD FALLITO — DATABASE_URL mancante");
    console.error(`${LINE}\n`);
    process.exit(1);
  }

  // ── Parse entrambi i connection string ───────────────────────────────────────
  const dev = parseConnectionString(devUrl);
  const prod = parseConnectionString(prodUrl);

  if (!dev) {
    console.error(`\n  ✗ DATABASE_URL_DEV non è un URL valido: ${redactUrl(devUrl)}`);
    process.exit(1);
  }
  if (!prod) {
    console.error(`\n  ✗ DATABASE_URL non è un URL valido: ${redactUrl(prodUrl)}`);
    process.exit(1);
  }

  // ── Tabella riassuntiva ───────────────────────────────────────────────────────
  console.log("");
  console.log("  Branch        Host                                  DB");
  console.log("  ──────────── ─────────────────────────────────────────────────────────────");
  console.log(`  dev           ${dev.host.padEnd(44)} ${dev.dbname}`);
  console.log(`  prod          ${prod.host.padEnd(44)} ${prod.dbname}`);
  console.log("");

  let allPassed = true;

  // ── Check (b): entrambi devono contenere neon.tech ───────────────────────────
  if (!dev.host.includes("neon.tech")) {
    console.error(`  ✗ DATABASE_URL_DEV non punta a neon.tech: "${dev.host}"`);
    console.error("    Verifica che DATABASE_URL_DEV sia la connection string Neon corretta.");
    allPassed = false;
  } else {
    console.log(`  ✓ dev  → neon.tech confermato (${dev.host})`);
  }

  if (!prod.host.includes("neon.tech")) {
    console.error(`  ✗ DATABASE_URL non punta a neon.tech: "${prod.host}"`);
    console.error("    Verifica che DATABASE_URL sia la connection string Neon corretta.");
    allPassed = false;
  } else {
    console.log(`  ✓ prod → neon.tech confermato (${prod.host})`);
  }

  // ── Check (c): gli host devono essere DIVERSI ─────────────────────────────────
  if (dev.host === prod.host) {
    console.error(`\n  ✗ CRITICO — dev e prod puntano allo STESSO host Neon:`);
    console.error(`    host: "${dev.host}"`);
    console.error("    Questo significa che dev e prod condividono lo stesso branch.");
    console.error("    Rischio: drizzle-kit push, script diretti o migration applicate");
    console.error("    nel workspace colpiscono il database di PRODUZIONE.");
    console.error("    Azione: crea un branch Neon separato per dev e aggiorna DATABASE_URL_DEV.");
    allPassed = false;
  } else {
    console.log("  ✓ Host diversi — branch Neon separati confermati");
  }

  // ── Check (d): il dbname deve coincidere (stesso progetto Neon) ──────────────
  if (dev.dbname && prod.dbname && dev.dbname !== prod.dbname) {
    console.error(`\n  ✗ Il dbname differisce tra dev e prod:`);
    console.error(`    dev:  "${dev.dbname}"`);
    console.error(`    prod: "${prod.dbname}"`);
    console.error("    Dev e prod dovrebbero essere branch dello stesso progetto Neon");
    console.error("    (stesso dbname). Verifica la configurazione del branching.");
    allPassed = false;
  } else if (dev.dbname && prod.dbname) {
    console.log(`  ✓ DB name coincide su entrambi i branch: "${dev.dbname}"`);
  } else {
    console.log("  ℹ DB name non determinabile dai connection string — skip check (d)");
  }

  // ── Report finale ─────────────────────────────────────────────────────────────
  console.log(`\n${LINE}`);
  if (allPassed) {
    console.log("  ✅ NEON BRANCHING OK — dev e prod su branch separati");
  } else {
    console.error("  ❌ GUARD FALLITO — dev e prod NON sono su branch Neon separati");
    console.error("     Correggi la configurazione prima di fare deploy.");
  }
  console.log(`${LINE}\n`);

  process.exit(allPassed ? 0 : 1);
}

main();
