/**
 * Offline preflight for the manual Replit -> Cloudflare R2 migration.
 *
 * This command never connects to Replit, R2, Railway or the database.
 * It validates only local configuration and refuses to treat placeholders
 * as credentials. The real copy remains an explicit, credential-gated step.
 *
 * Usage:
 *   npx tsx scripts/r2-migration-preflight.ts
 */
const REQUIRED = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BUCKET",
  "R2_PRIVATE_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

function isPlaceholder(value: string): boolean {
  return !value.trim() || /^(changeme|replace[-_]?me|todo|example|dummy)$/i.test(value.trim());
}

function main(): void {
  const missing = REQUIRED.filter((name) => {
    const value = process.env[name];
    return value === undefined || isPlaceholder(value);
  });

  const endpoint = process.env.R2_ENDPOINT?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();
  const errors: string[] = [];

  if (endpoint) {
    try {
      if (new URL(endpoint).protocol !== "https:") {
        errors.push("R2_ENDPOINT deve usare HTTPS.");
      }
    } catch {
      errors.push("R2_ENDPOINT non è un URL valido.");
    }
  }

  if (publicBaseUrl) {
    try {
      if (new URL(publicBaseUrl).protocol !== "https:") {
        errors.push("R2_PUBLIC_BASE_URL deve usare HTTPS.");
      }
    } catch {
      errors.push("R2_PUBLIC_BASE_URL non è un URL valido.");
    }
  }

  if (process.env.R2_PUBLIC_BUCKET?.trim() === process.env.R2_PRIVATE_BUCKET?.trim()) {
    errors.push("R2_PUBLIC_BUCKET e R2_PRIVATE_BUCKET devono essere bucket distinti.");
  }

  const stateFile = process.env.R2_MIGRATION_STATE_FILE?.trim() || ".r2-migration-state.json";
  if (stateFile.startsWith("/") || stateFile.includes("\\") || stateFile.includes("..")) {
    errors.push("R2_MIGRATION_STATE_FILE deve essere un percorso locale contenuto nel workspace.");
  }

  const report = {
    event: "r2_migration_preflight",
    mode: "offline",
    state_file: stateFile,
    required_variables: REQUIRED,
    missing_variables: missing,
    errors,
    ready_for_manual_run: missing.length === 0 && errors.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));

  if (missing.length > 0 || errors.length > 0) {
    process.exitCode = 1;
  }
}

main();
