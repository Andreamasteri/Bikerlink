/**
 * check-schema-drift.ts
 *
 * Compares every table declared in the Drizzle schema (shared/schema/*.ts)
 * against the live PostgreSQL database and reports:
 *   - columns present in schema but missing from DB (and vice-versa)
 *   - data-type / length mismatches (varchar length, text vs varchar, etc.)
 *   - nullability mismatches
 *
 * Exit code 0 → no drift found
 * Exit code 1 → drift detected (or DB unreachable)
 *
 * Usage:
 *   npx tsx scripts/check-schema-drift.ts
 *   npm run db:check
 */

import { Pool } from "pg";
import * as schema from "../shared/db/index";
import { SQL } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";

// ─── type-mapping helpers ────────────────────────────────────────────────────

/**
 * Map a Drizzle column's internal columnType string to the PostgreSQL
 * data_type value returned by information_schema.columns.
 */
function drizzleTypeToPgType(columnType: string): string | null {
  switch (columnType) {
    case "PgVarchar":      return "character varying";
    case "PgText":         return "text";
    case "PgChar":         return "character";
    case "PgInteger":      return "integer";
    case "PgSerial":       return "integer";        // serial → integer in IS
    case "PgBigInt53":
    case "PgBigInt64":     return "bigint";
    case "PgBigSerial":    return "bigint";
    case "PgSmallInt":     return "smallint";
    case "PgDoublePrecision": return "double precision";
    case "PgReal":         return "real";
    case "PgBoolean":      return "boolean";
    case "PgTimestamp":    return "timestamp without time zone";
    case "PgTimestampString": return "timestamp without time zone";
    case "PgTimestampTz":  return "timestamp with time zone";
    case "PgDate":         return "date";
    case "PgJson":         return "json";
    case "PgJsonb":        return "jsonb";
    case "PgUUID":         return "uuid";
    case "PgEnum":         return "USER-DEFINED";   // enums are USER-DEFINED in IS
    default:               return null;             // unknown → skip comparison
  }
}

/**
 * For timestamp columns: the Drizzle timestamp() default has no timezone,
 * but timestamp({ withTimezone: true }) maps to "timestamp with time zone".
 * We detect withTimezone via the column's internal config object.
 */
function timestampPgType(col: unknown): string {
  // Accessing Drizzle internal column config object — no public API available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = (col as any)?.config ?? (col as any);
  const withTz = config?.withTimezone === true || config?.mode === "string";
  return withTz ? "timestamp with time zone" : "timestamp without time zone";
}

// ─── schema introspection ────────────────────────────────────────────────────

interface ColMeta {
  name: string;
  pgType: string | null;      // expected PG data_type (null = skip type check)
  maxLen: number | null;      // expected character_maximum_length (null = N/A)
  notNull: boolean;
}

function getSchemaTableMetas() {
  const tables: Array<{ tableName: string; cols: ColMeta[] }> = [];

  for (const value of Object.values(schema)) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      value instanceof SQL ||
      value instanceof Function
    ) continue;

    try {
      const tbl = value as PgTable;
      const config = getTableConfig(tbl);
      if (!config?.name || !config.columns?.length) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cols: ColMeta[] = config.columns.map((col: any) => {
        const columnType: string = col.columnType ?? "";

        let pgType: string | null;
        if (columnType === "PgTimestamp" || columnType === "PgTimestampString") {
          pgType = timestampPgType(col);
        } else {
          pgType = drizzleTypeToPgType(columnType);
        }

        // varchar length lives in col.config?.length or col.length
        let maxLen: number | null = null;
        if (columnType === "PgVarchar" || columnType === "PgChar") {
          maxLen = col.config?.length ?? col.length ?? null;
        }

        return {
          name: col.name as string,
          pgType,
          maxLen,
          notNull: col.notNull === true,
        };
      });

      tables.push({ tableName: config.name, cols });
    } catch {
      // not a PgTable, skip
    }
  }

  return tables;
}

// ─── DB introspection ────────────────────────────────────────────────────────

interface DbColMeta {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: "YES" | "NO";
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let driftFound = false;
  const driftLines: string[] = [];
  const okLines: string[] = [];

  try {
    const schemaTables = getSchemaTableMetas();

    for (const { tableName, cols: schemaCols } of schemaTables) {
      const result = await pool.query<DbColMeta>(
        `SELECT column_name, data_type, character_maximum_length,
                is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = $1
         ORDER BY ordinal_position`,
        [tableName],
      );

      if (result.rows.length === 0) {
        driftFound = true;
        driftLines.push(
          `  ✖  Table "${tableName}" exists in schema but NOT in the database`,
        );
        continue;
      }

      const dbByName = new Map<string, DbColMeta>(
        result.rows.map((r) => [r.column_name, r]),
      );
      const schemaNames = schemaCols.map((c) => c.name);

      const missingFromDb = schemaNames.filter((n) => !dbByName.has(n));
      const extraInDb = [...dbByName.keys()].filter(
        (n) => !schemaNames.includes(n),
      );

      const typeIssues: string[] = [];
      for (const col of schemaCols) {
        const dbCol = dbByName.get(col.name);
        if (!dbCol) continue; // already captured in missingFromDb

        // ── type check ───────────────────────────────────────────────
        if (col.pgType !== null) {
          const expectedType = col.pgType.toLowerCase();
          const actualType = dbCol.data_type.toLowerCase();
          if (expectedType !== actualType) {
            typeIssues.push(
              `    type mismatch on "${col.name}": schema="${col.pgType}" db="${dbCol.data_type}"`,
            );
          }
        }

        // ── varchar length check ─────────────────────────────────────
        if (col.maxLen !== null && dbCol.character_maximum_length !== null) {
          if (col.maxLen !== dbCol.character_maximum_length) {
            typeIssues.push(
              `    length mismatch on "${col.name}": schema=${col.maxLen} db=${dbCol.character_maximum_length}`,
            );
          }
        }

        // ── nullability check ────────────────────────────────────────
        const schemaNotNull = col.notNull;
        const dbNotNull = dbCol.is_nullable === "NO";
        if (schemaNotNull !== dbNotNull) {
          typeIssues.push(
            `    nullability mismatch on "${col.name}": schema=${schemaNotNull ? "NOT NULL" : "NULLABLE"} db=${dbNotNull ? "NOT NULL" : "NULLABLE"}`,
          );
        }
      }

      const hasDrift =
        missingFromDb.length > 0 || extraInDb.length > 0 || typeIssues.length > 0;

      if (hasDrift) {
        driftFound = true;
        driftLines.push(`  ✖  Table "${tableName}" has drift:`);
        if (missingFromDb.length > 0) {
          driftLines.push(
            `       In schema but NOT in DB : ${missingFromDb.join(", ")}`,
          );
        }
        if (extraInDb.length > 0) {
          driftLines.push(
            `       In DB but NOT in schema : ${extraInDb.join(", ")}`,
          );
        }
        typeIssues.forEach((l) => driftLines.push(`      ${l}`));
      } else {
        okLines.push(`  ✔  ${tableName}`);
      }
    }
  } catch (err) {
    console.error("ERROR: Could not connect to the database.", err);
    await pool.end();
    process.exit(1);
  }

  await pool.end();

  console.log("══════════════════════════════════════════════");
  console.log("  BikerLink — DB Schema Drift Check");
  console.log("══════════════════════════════════════════════");

  if (okLines.length > 0) {
    console.log("\nTables in sync:");
    okLines.forEach((l) => console.log(l));
  }

  if (driftLines.length > 0) {
    console.log("\nDrift detected:");
    driftLines.forEach((l) => console.log(l));
  }

  console.log(`\n══════════════════════════════════════════════`);
  if (driftFound) {
    console.log(
      "  RESULT: DRIFT FOUND — run `npm run db:push` to sync the database",
    );
    console.log("══════════════════════════════════════════════");
    process.exit(1);
  } else {
    console.log(
      `  RESULT: OK — ${okLines.length} tables in sync, no drift`,
    );
    console.log("══════════════════════════════════════════════");
    process.exit(0);
  }
}

main();
