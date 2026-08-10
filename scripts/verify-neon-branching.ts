/**
 * Verifies all three explicit Neon targets without opening a database connection.
 * Generic DATABASE_URL is intentionally rejected to prevent an ambiguous target.
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
    return { host, dbname, branchHint: host.split(".")[0] ?? host };
  } catch {
    return null;
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} mancante: target Neon non identificato.`);
  return value;
}

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function main(): void {
  if (process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL generica rilevata: usare solo DATABASE_URL_DEV, DATABASE_URL_CANDIDATE e DATABASE_URL_PRODUCTION.");
  }

  const targets = {
    dev: parseConnectionString(required("DATABASE_URL_DEV")),
    candidate: parseConnectionString(required("DATABASE_URL_CANDIDATE")),
    production: parseConnectionString(required("DATABASE_URL_PRODUCTION")),
  };

  for (const [name, target] of Object.entries(targets)) {
    if (!target) fail(`DATABASE_URL_${name.toUpperCase()} non valida.`);
    if (!target.host.endsWith("neon.tech")) {
      fail(`Il target ${name} non punta a Neon: ${target.host}`);
    }
  }

  const parsed = targets as {
    dev: ParsedConnection;
    candidate: ParsedConnection;
    production: ParsedConnection;
  };

  const hosts = Object.values(parsed).map((target) => target.host);
  if (new Set(hosts).size !== hosts.length) {
    fail(`I tre target condividono un host Neon: ${hosts.join(" / ")}`);
  }

  const dbnames = Object.values(parsed).map((target) => target.dbname).filter(Boolean);
  if (new Set(dbnames).size > 1) {
    fail(`I tre target usano database name diversi: ${dbnames.join(" / ")}`);
  }

  console.log("✅ NEON TARGETS OK");
  for (const [name, target] of Object.entries(parsed)) {
    console.log(`   ${name.padEnd(10)}: ${target.host} (${target.branchHint})`);
  }
}

main();
