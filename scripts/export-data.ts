#!/usr/bin/env tsx
/**
 * BikerLink — Data Export CLI
 * Usage: npx tsx scripts/export-data.ts [options]
 *
 * Options:
 *   --exclude-fake          Exclude users with is_fake=true and all their data
 *   --since=YYYY-MM-DD      Filter records with created_at >= date
 *   --tables=t1,t2,...      Export only the specified tables
 *   --no-compress           Write .jsonl/.csv instead of .jsonl.gz/.csv.gz
 *   --format=csv            Write CSV files instead of JSONL
 *
 * Query builders and row iterators: scripts/export-data-queries.ts
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { Pool } from "pg";
import {
  ALL_TABLES,
  TABLE_COLUMNS,
  type TableName,
  buildUsersQuery,
  buildUserProfilesQuery,
  buildUserMotorcyclesQuery,
  buildRoutesQuery,
  buildRoutePointsQuery,
  buildPlannedRoutesQuery,
  buildSprintResultsQuery,
  simpleQuery,
  chunkedQuery,
} from "./export-data-queries.js";

// ─── CLI Flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const excludeFake = args.includes("--exclude-fake");
const noCompress = args.includes("--no-compress");

const formatArg = args.find((a) => a.startsWith("--format="));
const outputFormat: "jsonl" | "csv" = formatArg?.split("=")[1] === "csv" ? "csv" : "jsonl";

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

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });

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

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str: string;
  if (typeof value === "object") {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function writeCsv(outputPath: string, compress: boolean, headers: string[], rowIterator: AsyncIterable<Record<string, unknown>>): Promise<number> {
  let count = 0;
  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createWriteStream(outputPath);
    let gz: zlib.Gzip | null = null;
    const target: fs.WriteStream | zlib.Gzip = compress
      ? (() => { gz = zlib.createGzip({ level: 6 }); gz.pipe(fileStream); return gz; })()
      : fileStream;
    (async () => {
      try {
        const headerLine = headers.map(csvCell).join(",") + "\n";
        const headerOk = target.write(headerLine);
        if (!headerOk) await new Promise<void>((r) => target.once("drain", r));
        for await (const row of rowIterator) {
          const line = headers.map((h) => csvCell(row[h])).join(",") + "\n";
          const ok = target.write(line);
          if (!ok) await new Promise<void>((r) => target.once("drain", r));
          count++;
        }
        target.end();
      } catch (err) { reject(err); fileStream.destroy(); }
    })();
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
    if (gz) gz.on("error", reject);
  });
  return count;
}

async function writeJsonl(outputPath: string, compress: boolean, rowIterator: AsyncIterable<Record<string, unknown>>): Promise<number> {
  let count = 0;
  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createWriteStream(outputPath);
    let gz: zlib.Gzip | null = null;
    const target: fs.WriteStream | zlib.Gzip = compress
      ? (() => { gz = zlib.createGzip({ level: 6 }); gz.pipe(fileStream); return gz; })()
      : fileStream;
    (async () => {
      try {
        for await (const row of rowIterator) {
          const line = JSON.stringify(row) + "\n";
          const ok = target.write(line);
          if (!ok) await new Promise<void>((r) => target.once("drain", r));
          count++;
        }
        target.end();
      } catch (err) { reject(err); fileStream.destroy(); }
    })();
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
    if (gz) gz.on("error", reject);
  });
  return count;
}

// ─── Export Table ─────────────────────────────────────────────────────────────

interface ExportResult { table: string; rows: number; bytes: number; file: string }

async function exportTable(tableName: TableName, outputDir: string): Promise<ExportResult> {
  const isCsv = outputFormat === "csv";
  const compress = !noCompress;
  const baseExt = isCsv ? ".csv" : ".jsonl";
  const ext = compress ? `${baseExt}.gz` : baseExt;
  const outputPath = path.join(outputDir, `${tableName}${ext}`);

  const queryBuilders: Record<TableName, () => { sql: string; params: unknown[] }> = {
    users:            () => buildUsersQuery(excludeFake, since),
    user_profiles:    () => buildUserProfilesQuery(excludeFake, since),
    user_motorcycles: () => buildUserMotorcyclesQuery(excludeFake, since),
    routes:           () => buildRoutesQuery(excludeFake, since),
    route_points:     () => buildRoutePointsQuery(excludeFake, since),
    planned_routes:   () => buildPlannedRoutesQuery(excludeFake, since),
    sprint_results:   () => buildSprintResultsQuery(excludeFake, since),
  };

  const { sql, params } = queryBuilders[tableName]();
  const isChunked = tableName === "route_points";
  const iterator = isChunked ? chunkedQuery(pool, sql, params) : simpleQuery(pool, sql, params);

  process.stdout.write(`  Exporting ${tableName}... `);
  const rows = isCsv
    ? await writeCsv(outputPath, compress, TABLE_COLUMNS[tableName], iterator)
    : await writeJsonl(outputPath, compress, iterator);
  const bytes = fs.statSync(outputPath).size;
  console.log(`${rows.toLocaleString()} rows → ${formatBytes(bytes)}`);

  return { table: tableName, rows, bytes, file: outputPath };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   BikerLink — Data Export Script     ║");
  console.log("╚══════════════════════════════════════╝\n");
  console.log(`  --exclude-fake : ${excludeFake}`);
  console.log(`  --since        : ${since ?? "(none)"}`);
  console.log(`  --tables       : ${tablesToExport.join(", ")}`);
  console.log(`  --no-compress  : ${noCompress}`);
  console.log(`  --format       : ${outputFormat.toUpperCase()}\n`);

  const outputDir = getOutputDir();
  console.log(`Output directory: ${outputDir}\n`);

  const startTime = Date.now();
  const results: ExportResult[] = [];
  let hasFailures = false;

  for (const table of tablesToExport) {
    try {
      results.push(await exportTable(table, outputDir));
    } catch (err) {
      console.error(`  ERROR exporting ${table}:`, err instanceof Error ? err.message : err);
      results.push({ table, rows: -1, bytes: 0, file: "" });
      hasFailures = true;
    }
  }

  const manifestPath = path.join(outputDir, "export-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    scriptVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    filters: { excludeFake, since: since ?? null, tables: tablesToExport, noCompress, format: outputFormat },
    tables: results.map((r) => ({ table: r.table, rows: r.rows, bytes: r.bytes, file: path.basename(r.file) })),
  }, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const colTable = Math.max(14, ...results.map((r) => r.table.length));
  const totalWidth = colTable + 12 + 10 + 6 + 16;
  console.log("\n" + "─".repeat(totalWidth));
  console.log(`${"Table".padEnd(colTable)}  ${"Rows".padStart(12)}  ${"Size".padStart(10)}  ${"Format".padEnd(6)}  Path`);
  console.log("─".repeat(totalWidth));

  let totalRows = 0; let totalBytes = 0;
  for (const r of results) {
    const rows = r.rows >= 0 ? r.rows.toLocaleString() : "ERROR";
    const size = r.bytes > 0 ? formatBytes(r.bytes) : "—";
    const shortPath = r.file ? path.relative(process.cwd(), r.file) : "(failed)";
    console.log(`${r.table.padEnd(colTable)}  ${rows.padStart(12)}  ${size.padStart(10)}  ${outputFormat.toUpperCase().padEnd(6)}  ${shortPath}`);
    if (r.rows > 0) totalRows += r.rows;
    totalBytes += r.bytes;
  }
  console.log("─".repeat(totalWidth));
  console.log(`${"TOTAL".padEnd(colTable)}  ${totalRows.toLocaleString().padStart(12)}  ${formatBytes(totalBytes).padStart(10)}`);
  console.log(`\nCompleted in ${elapsed}s`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}\n`);

  if (hasFailures) { console.error("⚠  One or more table exports failed — see errors above."); }

  await pool.end();
  if (hasFailures) process.exit(1);
}

main().catch((err) => {
  console.error("[export] Fatal error:", err);
  pool.end().finally(() => process.exit(1));
});
