import { pool } from "../../server/db";
import { runMigrations } from "../../server/migrate";

async function main(): Promise<void> {
  try {
    await runMigrations();
    console.log("MIGRATION_SMOKE_OK");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    "MIGRATION_SMOKE_FAILED:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
