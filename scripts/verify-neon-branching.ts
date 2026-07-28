/**
 * Verifies that development and production use distinct Neon branches.
 * Parsing-only: this script never opens a database connection.
 */

type ParsedConnection = {
  host: string;
  dbname: string;
  branchHint: string;
};

function parseConnectionString(raw: string): ParsedConnection | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const dbname = url.pathname.replace(/^\//, "").split("?")[0] ?? "";
    if (!host) return null;
    const branchHint = host.split(".")[0] ?? host;
    return { host, dbname, branchHint };
  } catch {
    return null;
  }
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//<redacted>@${url.host}${url.pathname}`;
  } catch {
    return "<non-parseable URL>";
  }
}

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function main(): void {
  const devUrl = process.env.DATABASE_URL_DEV;
  const explicitProdUrl = process.env.DATABASE_URL_PROD ?? process.env.PROD_DATABASE_URL;
  const ambientUrl = process.env.DATABASE_URL;
  const prodUrl = explicitProdUrl ?? ambientUrl;

  if (!devUrl) {
    fail("DATABASE_URL_DEV mancante: gli script locali non hanno un branch Neon isolato.");
  }
  if (!prodUrl) {
    fail("DATABASE_URL_PROD / PROD_DATABASE_URL mancante: impossibile confrontare dev e produzione.");
  }

  const dev = parseConnectionString(devUrl);
  const prod = parseConnectionString(prodUrl);
  if (!dev) fail(`DATABASE_URL_DEV non valido: ${redactUrl(devUrl)}`);
  if (!prod) fail(`URL produzione non valido: ${redactUrl(prodUrl)}`);

  if (!dev.host.endsWith("neon.tech")) {
    fail(`DATABASE_URL_DEV non punta a Neon: ${dev.host}`);
  }
  if (!prod.host.endsWith("neon.tech")) {
    fail(`Il database di produzione non punta a Neon: ${prod.host}`);
  }
  if (dev.host === prod.host) {
    fail(`CRITICO: sviluppo e produzione condividono lo stesso host Neon (${dev.host}).`);
  }
  if (dev.dbname && prod.dbname && dev.dbname !== prod.dbname) {
    fail(`Dev e prod usano database name differenti (${dev.dbname} / ${prod.dbname}); verificare che siano branch dello stesso progetto.`);
  }

  // In locale DATABASE_URL è spesso consumata implicitamente da drizzle e dagli
  // script. Deve quindi puntare al branch dev, non a produzione.
  if (process.env.NODE_ENV !== "production" && ambientUrl) {
    const ambient = parseConnectionString(ambientUrl);
    if (!ambient) fail(`DATABASE_URL locale non valido: ${redactUrl(ambientUrl)}`);
    if (ambient.host === prod.host) {
      fail("DATABASE_URL locale punta al branch di produzione. Impostarla uguale a DATABASE_URL_DEV.");
    }
    if (ambient.host !== dev.host) {
      fail(`DATABASE_URL locale (${ambient.host}) non coincide con DATABASE_URL_DEV (${dev.host}).`);
    }
  }

  // Destructive scripts must opt in explicitly even on a dev branch.
  const destructiveIntent = process.env.BIKERLINK_DESTRUCTIVE_DB_OPERATION === "1";
  const productionOverride = process.env.BIKERLINK_ALLOW_PRODUCTION_DB === "I_UNDERSTAND_DATA_LOSS";
  if (destructiveIntent && productionOverride) {
    fail("Configurazione contraddittoria: un'operazione distruttiva non può essere autorizzata verso produzione.");
  }

  console.log("✅ NEON BRANCHING OK");
  console.log(`   dev : ${dev.host} (${dev.branchHint})`);
  console.log(`   prod: ${prod.host} (${prod.branchHint})`);
  console.log("   DATABASE_URL locale isolata dalla produzione");
}

main();
