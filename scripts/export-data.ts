#!/usr/bin/env tsx
/**
 * BikerLink — Data Export CLI
 * Usage: npx tsx scripts/export-data.ts [options]
 *
 * Options:
 *   --exclude-fake          Exclude users with is_fake=true and all their data
 *   --since=YYYY-MM-DD      Filter records with created_at >= date
 *   --tables=t1,t2,...      Export only the specified tables
 *   --no-compress           Write .jsonl instead of .jsonl.gz
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { Pool } from "pg";

// ─── CLI Flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const excludeFake = args.includes("--exclude-fake");
const noCompress = args.includes("--no-compress");

const sinceArg = args.find((a) => a.startsWith("--since="));
const since: string | null = sinceArg ? sinceArg.split("=")[1] : null;
if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  console.error(`[export] --since value invalid: "${since}" (expected YYYY-MM-DD)`);
  process.exit(1);
}

const tablesArg = args.find((a) => a.startsWith("--tables="));
const requestedTables: Set<string> | null = tablesArg
  ? new Set(tablesArg.split("=")[1].split(",").map((t) => t.trim()))
  : null;

const ALL_TABLES = [
  "users",
  "user_profiles",
  "user_motorcycles",
  "routes",
  "route_points",
  "planned_routes",
  "sprint_results",
] as const;
type TableName = (typeof ALL_TABLES)[number];

const tablesToExport: TableName[] = requestedTables
  ? ALL_TABLES.filter((t) => requestedTables.has(t))
  : [...ALL_TABLES];

if (tablesToExport.length === 0) {
  console.error("[export] No valid tables selected. Valid tables:", ALL_TABLES.join(", "));
  process.exit(1);
}

// ─── DB Connection ────────────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error("[export] DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

// ─── Output Directory ─────────────────────────────────────────────────────────

function getOutputDir(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const dir = path.join(process.cwd(), "exports", label);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function writeJsonl(
  outputPath: string,
  compress: boolean,
  rowIterator: AsyncIterable<Record<string, unknown>>,
): Promise<number> {
  let count = 0;

  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createWriteStream(outputPath);
    let gz: zlib.Gzip | null = null;
    const target: fs.WriteStream | zlib.Gzip = compress
      ? (() => {
          gz = zlib.createGzip({ level: 6 });
          gz.pipe(fileStream);
          return gz;
        })()
      : fileStream;

    (async () => {
      try {
        for await (const row of rowIterator) {
          const line = JSON.stringify(row) + "\n";
          const ok = target.write(line);
          if (!ok) {
            await new Promise<void>((r) => target.once("drain", r));
          }
          count++;
        }
        target.end();
      } catch (err) {
        reject(err);
        fileStream.destroy();
      }
    })();

    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
    if (gz) {
      gz.on("error", reject);
    }
  });

  return count;
}

// ─── Row Iterators ────────────────────────────────────────────────────────────

/**
 * Async generator for tables that can be fetched in a single query.
 */
async function* simpleQuery(
  sql: string,
  params: unknown[],
): AsyncIterable<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    for (const row of result.rows) {
      yield row as Record<string, unknown>;
    }
  } finally {
    client.release();
  }
}

/**
 * Async generator for large tables using LIMIT/OFFSET pagination.
 */
async function* chunkedQuery(
  sql: string,
  params: unknown[],
  chunkSize = 10_000,
): AsyncIterable<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    let offset = 0;
    while (true) {
      const result = await client.query(`${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [
        ...params,
        chunkSize,
        offset,
      ]);
      for (const row of result.rows) {
        yield row as Record<string, unknown>;
      }
      if (result.rows.length < chunkSize) break;
      offset += chunkSize;
    }
  } finally {
    client.release();
  }
}

// ─── Table Query Builders ─────────────────────────────────────────────────────

// --since semantics per table:
//   users, user_motorcycles, routes, planned_routes, sprint_results → created_at
//   user_profiles → updated_at (no created_at column in schema)
//   route_points  → timestamp  (no created_at column; this is the GPS point time)

const FAKE_USER_SUBQUERY = "SELECT id FROM users WHERE is_fake = true";

function buildUsersQuery(): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (excludeFake) conditions.push("is_fake = false");
  if (since) {
    params.push(since);
    conditions.push(`created_at >= $${params.length}::date`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return {
    sql: `SELECT
      id,
      nickname,
      email,
      password,
      role,
      status,
      is_fake        AS "isFake",
      country,
      region,
      birth_year     AS "birthYear",
      created_at     AS "createdAt",
      last_login_at  AS "lastLoginAt"
    FROM users ${where} ORDER BY created_at`,
    params,
  };
}

function buildUserProfilesQuery(): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (excludeFake) {
    conditions.push(`user_id NOT IN (${FAKE_USER_SUBQUERY})`);
  }
  if (since) {
    params.push(since);
    conditions.push(`updated_at >= $${params.length}::date`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return {
    sql: `SELECT
      user_id      AS "userId",
      bio,
      total_km     AS "totalKm",
      total_rides  AS "totalRides",
      latitude,
      longitude,
      is_available AS "isAvailable"
    FROM user_profiles ${where} ORDER BY user_id`,
    params,
  };
}

function buildUserMotorcyclesQuery(): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (excludeFake) {
    conditions.push(`user_id NOT IN (${FAKE_USER_SUBQUERY})`);
  }
  if (since) {
    params.push(since);
    conditions.push(`created_at >= $${params.length}::date`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return {
    sql: `SELECT
      user_id          AS "userId",
      brand,
      model,
      year,
      displacement,
      motorcycle_type  AS "motorcycleType",
      riding_style     AS "ridingStyle",
      created_at       AS "createdAt"
    FROM user_motorcycles ${where} ORDER BY created_at`,
    params,
  };
}

function buildRoutesQuery(): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (excludeFake) {
    conditions.push(`user_id NOT IN (${FAKE_USER_SUBQUERY})`);
  }
  if (since) {
    params.push(since);
    conditions.push(`created_at >= $${params.length}::date`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return {
    sql: `SELECT
      id,
      user_id               AS "userId",
      title,
      status,
      total_distance_km     AS "totalDistanceKm",
      max_speed_kmh         AS "maxSpeedKmh",
      avg_speed_kmh         AS "avgSpeedKmh",
      max_altitude          AS "maxAltitude",
      duration_seconds      AS "durationSeconds",
      idle_time_seconds     AS "idleTimeSeconds",
      max_tilt_deg          AS "maxTiltDeg",
      max_acceleration_g    AS "maxAccelerationG",
      max_deceleration_g    AS "maxDecelerationG",
      max_lateral_g         AS "maxLateralG",
      is_sprint             AS "isSprint",
      sprint_0to100_ms      AS "sprint0to100Ms",
      gps_blackout_count    AS "gpsBlackoutCount",
      gps_blackout_seconds  AS "gpsBlackoutSeconds",
      likes,
      started_at            AS "startedAt",
      stopped_at            AS "stoppedAt",
      created_at            AS "createdAt"
    FROM routes ${where} ORDER BY created_at`,
    params,
  };
}

function buildRoutePointsQuery(): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (excludeFake) {
    conditions.push(`route_id IN (SELECT id FROM routes WHERE user_id NOT IN (${FAKE_USER_SUBQUERY}))`);
  }
  if (since) {
    params.push(since);
    conditions.push(`timestamp >= $${params.length}::date`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return {
    sql: `SELECT
      route_id  AS "routeId",
      latitude  AS "lat",
      longitude AS "lng",
      altitude,
      speed_kmh AS "speedKmh",
      accel_g   AS "accelG",
      tilt_deg  AS "tiltDeg",
      timestamp
    FROM route_points ${where} ORDER BY route_id, timestamp`,
    params,
  };
}

function buildPlannedRoutesQuery(): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (excludeFake) {
    conditions.push(`user_id NOT IN (${FAKE_USER_SUBQUERY})`);
  }
  if (since) {
    params.push(since);
    conditions.push(`created_at >= $${params.length}::date`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return {
    sql: `SELECT
      id,
      user_id               AS "userId",
      title,
      distance_km           AS "distanceKm",
      style,
      biker_score           AS "bikerScore",
      real_curvature_score  AS "curvatureScore",
      waypoints,
      created_at            AS "createdAt"
    FROM planned_routes ${where} ORDER BY created_at`,
    params,
  };
}

function buildSprintResultsQuery(): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (excludeFake) {
    conditions.push(`user_id NOT IN (${FAKE_USER_SUBQUERY})`);
  }
  if (since) {
    params.push(since);
    conditions.push(`created_at >= $${params.length}::date`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return {
    sql: `SELECT
      user_id           AS "userId",
      route_id          AS "routeId",
      sprint_0to100_ms  AS "sprint0to100Ms",
      max_acceleration_g AS "maxAccelerationG",
      max_tilt_deg      AS "maxTiltDeg",
      created_at        AS "createdAt"
    FROM sprint_results ${where} ORDER BY created_at`,
    params,
  };
}

// ─── Export Table ─────────────────────────────────────────────────────────────

interface ExportResult {
  table: string;
  rows: number;
  bytes: number;
  file: string;
}

async function exportTable(
  tableName: TableName,
  outputDir: string,
): Promise<ExportResult> {
  const ext = noCompress ? ".jsonl" : ".jsonl.gz";
  const fileName = `${tableName}${ext}`;
  const outputPath = path.join(outputDir, fileName);

  let iterator: AsyncIterable<Record<string, unknown>>;
  const isChunked = tableName === "route_points";

  let querySql: string;
  let queryParams: unknown[];

  switch (tableName) {
    case "users": {
      const q = buildUsersQuery();
      querySql = q.sql;
      queryParams = q.params;
      break;
    }
    case "user_profiles": {
      const q = buildUserProfilesQuery();
      querySql = q.sql;
      queryParams = q.params;
      break;
    }
    case "user_motorcycles": {
      const q = buildUserMotorcyclesQuery();
      querySql = q.sql;
      queryParams = q.params;
      break;
    }
    case "routes": {
      const q = buildRoutesQuery();
      querySql = q.sql;
      queryParams = q.params;
      break;
    }
    case "route_points": {
      const q = buildRoutePointsQuery();
      querySql = q.sql;
      queryParams = q.params;
      break;
    }
    case "planned_routes": {
      const q = buildPlannedRoutesQuery();
      querySql = q.sql;
      queryParams = q.params;
      break;
    }
    case "sprint_results": {
      const q = buildSprintResultsQuery();
      querySql = q.sql;
      queryParams = q.params;
      break;
    }
  }

  iterator = isChunked
    ? chunkedQuery(querySql, queryParams)
    : simpleQuery(querySql, queryParams);

  process.stdout.write(`  Exporting ${tableName}... `);
  const rows = await writeJsonl(outputPath, !noCompress, iterator);
  const bytes = fs.statSync(outputPath).size;
  console.log(`${rows.toLocaleString()} rows → ${formatBytes(bytes)}`);

  return { table: tableName, rows, bytes, file: outputPath };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   BikerLink — Data Export Script     ║");
  console.log("╚══════════════════════════════════════╝\n");

  console.log("Options:");
  console.log(`  --exclude-fake : ${excludeFake}`);
  console.log(`  --since        : ${since ?? "(none)"}`);
  console.log(`  --tables       : ${tablesToExport.join(", ")}`);
  console.log(`  --no-compress  : ${noCompress}`);
  console.log();

  const outputDir = getOutputDir();
  console.log(`Output directory: ${outputDir}\n`);

  const startTime = Date.now();
  const results: ExportResult[] = [];

  let hasFailures = false;
  for (const table of tablesToExport) {
    try {
      const result = await exportTable(table, outputDir);
      results.push(result);
    } catch (err) {
      console.error(`  ERROR exporting ${table}:`, err instanceof Error ? err.message : err);
      results.push({ table, rows: -1, bytes: 0, file: "" });
      hasFailures = true;
    }
  }

  // ── Manifest ────────────────────────────────────────────────────────────────

  const manifestPath = path.join(outputDir, "export-manifest.json");
  const manifest = {
    scriptVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    filters: {
      excludeFake,
      since: since ?? null,
      tables: tablesToExport,
      noCompress,
    },
    tables: results.map((r) => ({
      table: r.table,
      rows: r.rows,
      bytes: r.bytes,
      file: path.basename(r.file),
    })),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // ── Summary Table ────────────────────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const colTable = Math.max(14, ...results.map((r) => r.table.length));
  const colRows = 12;
  const colSize = 10;

  console.log();
  console.log("─".repeat(colTable + colRows + colSize + 12));
  console.log(
    `${"Table".padEnd(colTable)}  ${"Rows".padStart(colRows)}  ${"Size".padStart(colSize)}  Path`,
  );
  console.log("─".repeat(colTable + colRows + colSize + 12));

  let totalRows = 0;
  let totalBytes = 0;
  for (const r of results) {
    const rows = r.rows >= 0 ? r.rows.toLocaleString() : "ERROR";
    const size = r.bytes > 0 ? formatBytes(r.bytes) : "—";
    const shortPath = r.file ? path.relative(process.cwd(), r.file) : "(failed)";
    console.log(
      `${r.table.padEnd(colTable)}  ${rows.padStart(colRows)}  ${size.padStart(colSize)}  ${shortPath}`,
    );
    if (r.rows > 0) totalRows += r.rows;
    totalBytes += r.bytes;
  }

  console.log("─".repeat(colTable + colRows + colSize + 12));
  console.log(
    `${"TOTAL".padEnd(colTable)}  ${totalRows.toLocaleString().padStart(colRows)}  ${formatBytes(totalBytes).padStart(colSize)}`,
  );
  console.log();
  if (hasFailures) {
    console.error(`\n⚠  One or more table exports failed — see errors above.`);
  }
  console.log(`Completed in ${elapsed}s`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`);
  console.log();

  await pool.end();

  if (hasFailures) process.exit(1);
}

main().catch((err) => {
  console.error("[export] Fatal error:", err);
  pool.end().finally(() => process.exit(1));
});
