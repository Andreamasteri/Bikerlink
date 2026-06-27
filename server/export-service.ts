import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { ZipArchive } from "archiver";
import { Pool } from "pg";
import { uploadBuffer, downloadBuffer, listObjects } from "./objectStorage";
import { db } from "./db";
import { appSettings } from "@shared/db";
import { eq } from "drizzle-orm";

export const EXPORT_OBJECT_PREFIX = ".private/exports";

export type ExportSchedule = "off" | "daily" | "weekly";

export interface ExportOptions {
  excludeFake: boolean;
  tables: string[];
}

export interface ExportMeta {
  id: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalRows: number;
  totalBytes: number;
  objectPath: string;
  fileName: string;
  options: ExportOptions;
  tables: { table: string; rows: number; bytes: number }[];
}

let schedulerTimer: NodeJS.Timeout | null = null;
let nextAt: Date | null = null;
let isExporting = false;

export function stopExportScheduler(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    nextAt = null;
  }
}

export interface ExportProgressTable {
  table: string;
  rows: number;
  status: "pending" | "running" | "done";
}

export interface ExportProgress {
  active: boolean;
  startedAt: string | null;
  currentTable: string | null;
  currentTableIndex: number;
  totalTables: number;
  rowsInCurrentTable: number;
  totalRowsSoFar: number;
  tables: ExportProgressTable[];
  phase: "idle" | "querying" | "archiving" | "uploading" | "done" | "error";
  error: string | null;
}

let exportProgress: ExportProgress = {
  active: false,
  startedAt: null,
  currentTable: null,
  currentTableIndex: 0,
  totalTables: 0,
  rowsInCurrentTable: 0,
  totalRowsSoFar: 0,
  tables: [],
  phase: "idle",
  error: null,
};

function resetProgress(tables: string[], startedAt: Date) {
  exportProgress = {
    active: true,
    startedAt: startedAt.toISOString(),
    currentTable: null,
    currentTableIndex: 0,
    totalTables: tables.length,
    rowsInCurrentTable: 0,
    totalRowsSoFar: 0,
    tables: tables.map((table) => ({ table, rows: 0, status: "pending" })),
    phase: "querying",
    error: null,
  };
}

export function getExportProgress(): ExportProgress {
  return exportProgress;
}

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

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
}

function addMs(ms: number): Date {
  return new Date(Date.now() + ms);
}

async function readSetting(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return rows.length > 0 ? (rows[0].value ?? null) : null;
  } catch {
    return null;
  }
}

async function upsertSetting(key: string, value: string, description?: string) {
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key));
  if (existing.length > 0) {
    await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, description });
  }
}

async function readJsonSetting<T>(key: string): Promise<T | null> {
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key));
    if (rows.length === 0 || rows[0].valueJson == null) return null;
    return rows[0].valueJson as T;
  } catch {
    return null;
  }
}

async function upsertJsonSetting(key: string, value: unknown, description?: string) {
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key));
  if (existing.length > 0) {
    await db.update(appSettings).set({ valueJson: value as Record<string, unknown>, updatedAt: new Date() }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, valueJson: value as Record<string, unknown>, description });
  }
}

export async function getExportSchedule(): Promise<ExportSchedule> {
  const val = await readSetting("exports.schedule");
  if (val === "daily" || val === "weekly") return val;
  return "off";
}

export function getScheduleIntervalMs(schedule: ExportSchedule): number | null {
  if (schedule === "daily") return 24 * 60 * 60 * 1000;
  if (schedule === "weekly") return 7 * 24 * 60 * 60 * 1000;
  return null;
}

export async function setExportSchedule(schedule: ExportSchedule): Promise<void> {
  await upsertSetting("exports.schedule", schedule, "Frequenza export automatico (off/daily/weekly)");
  await restartScheduler();
}

export async function getExportStatus() {
  const [schedule, history] = await Promise.all([
    getExportSchedule(),
    readJsonSetting<ExportMeta[]>("exports.history"),
  ]);
  return {
    isExporting,
    schedule,
    nextScheduled: nextAt?.toISOString() ?? null,
    schedulerActive: schedulerTimer !== null,
    lastExport: history && history.length > 0 ? history[history.length - 1] : null,
    historyCount: history?.length ?? 0,
  };
}

async function appendToHistory(meta: ExportMeta) {
  const existing = await readJsonSetting<ExportMeta[]>("exports.history");
  const history = Array.isArray(existing) ? existing : [];
  history.push(meta);
  const MAX_HISTORY = 50;
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  await upsertJsonSetting("exports.history", history, "Storico export dati (ultimi 50)");
}

export async function getExportHistory(): Promise<ExportMeta[]> {
  const history = await readJsonSetting<ExportMeta[]>("exports.history");
  if (!Array.isArray(history)) return [];
  return [...history].reverse();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function* simpleQuery(
  pool: Pool,
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

async function* chunkedQuery(
  pool: Pool,
  sql: string,
  params: unknown[],
  chunkSize = 10_000,
): AsyncIterable<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    let offset = 0;
    while (true) {
      const result = await client.query(
        `${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, chunkSize, offset],
      );
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

async function writeJsonlGz(
  outputPath: string,
  rowIterator: AsyncIterable<Record<string, unknown>>,
  onProgress?: (rows: number) => void,
): Promise<number> {
  let count = 0;
  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createWriteStream(outputPath);
    const gz = zlib.createGzip({ level: 6 });
    gz.pipe(fileStream);
    (async () => {
      try {
        for await (const row of rowIterator) {
          const line = JSON.stringify(row) + "\n";
          const ok = gz.write(line);
          if (!ok) await new Promise<void>((r) => gz.once("drain", r));
          count++;
          if (onProgress && count % 1000 === 0) onProgress(count);
        }
        if (onProgress) onProgress(count);
        gz.end();
      } catch (err) {
        reject(err);
        fileStream.destroy();
      }
    })();
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
    gz.on("error", reject);
  });
  return count;
}

const FAKE_SUBQUERY = "SELECT id FROM users WHERE is_fake = true";

function buildQuery(table: TableName, excludeFake: boolean): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  switch (table) {
    case "users":
      if (excludeFake) conditions.push("is_fake = false");
      return {
        sql: `SELECT id, nickname, email, role, status, is_fake AS "isFake", country, region, birth_year AS "birthYear", created_at AS "createdAt", last_login_at AS "lastLoginAt" FROM users ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""} ORDER BY created_at`,
        params,
      };
    case "user_profiles":
      if (excludeFake) conditions.push(`user_id NOT IN (${FAKE_SUBQUERY})`);
      return {
        sql: `SELECT user_id AS "userId", bio, total_km AS "totalKm", total_rides AS "totalRides", latitude, longitude, is_available AS "isAvailable" FROM user_profiles ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""} ORDER BY user_id`,
        params,
      };
    case "user_motorcycles":
      if (excludeFake) conditions.push(`user_id NOT IN (${FAKE_SUBQUERY})`);
      return {
        sql: `SELECT user_id AS "userId", brand, model, year, displacement, motorcycle_type AS "motorcycleType", riding_style AS "ridingStyle", created_at AS "createdAt" FROM user_motorcycles ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""} ORDER BY created_at`,
        params,
      };
    case "routes":
      if (excludeFake) conditions.push(`user_id NOT IN (${FAKE_SUBQUERY})`);
      return {
        sql: `SELECT id, user_id AS "userId", title, status, total_distance_km AS "totalDistanceKm", max_speed_kmh AS "maxSpeedKmh", avg_speed_kmh AS "avgSpeedKmh", duration_seconds AS "durationSeconds", likes, started_at AS "startedAt", created_at AS "createdAt" FROM routes ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""} ORDER BY created_at`,
        params,
      };
    case "route_points":
      if (excludeFake) conditions.push(`route_id IN (SELECT id FROM routes WHERE user_id NOT IN (${FAKE_SUBQUERY}))`);
      return {
        sql: `SELECT route_id AS "routeId", latitude AS "lat", longitude AS "lng", altitude, speed_kmh AS "speedKmh", timestamp FROM route_points ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""} ORDER BY route_id, timestamp`,
        params,
      };
    case "planned_routes":
      if (excludeFake) conditions.push(`user_id NOT IN (${FAKE_SUBQUERY})`);
      return {
        sql: `SELECT id, user_id AS "userId", title, distance_km AS "distanceKm", style, biker_score AS "bikerScore", created_at AS "createdAt" FROM planned_routes ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""} ORDER BY created_at`,
        params,
      };
    case "sprint_results":
      if (excludeFake) conditions.push(`user_id NOT IN (${FAKE_SUBQUERY})`);
      return {
        sql: `SELECT user_id AS "userId", route_id AS "routeId", sprint_0to100_ms AS "sprint0to100Ms", max_acceleration_g AS "maxAccelerationG", created_at AS "createdAt" FROM sprint_results ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""} ORDER BY created_at`,
        params,
      };
  }
}

export async function runExport(options: Partial<ExportOptions> = {}): Promise<ExportMeta> {
  if (isExporting) throw new Error("Export già in corso");
  isExporting = true;

  const opts: ExportOptions = {
    excludeFake: options.excludeFake ?? true,
    tables: options.tables ?? [...ALL_TABLES],
  };

  const startedAt = new Date();
  const ts = getTimestamp();
  const exportId = `export_${ts}`;
  const tmpDir = path.join(os.tmpdir(), exportId);
  const tmpZip = path.join(os.tmpdir(), `${exportId}.zip`);

  const tablesToExport = ALL_TABLES.filter((t) => opts.tables.includes(t));
  resetProgress([...tablesToExport], startedAt);

  if (!process.env.DATABASE_URL) {
    isExporting = false;
    exportProgress.active = false;
    exportProgress.phase = "error";
    exportProgress.error = "DATABASE_URL non configurato";
    throw new Error("DATABASE_URL non configurato");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  });

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    const tableResults: { table: string; rows: number; bytes: number }[] = [];
    let totalRows = 0;

    for (let i = 0; i < tablesToExport.length; i++) {
      const table = tablesToExport[i];
      const filePath = path.join(tmpDir, `${table}.jsonl.gz`);
      const { sql, params } = buildQuery(table, opts.excludeFake);
      const isChunked = table === "route_points";
      const iterator = isChunked
        ? chunkedQuery(pool, sql, params)
        : simpleQuery(pool, sql, params);

      exportProgress.phase = "querying";
      exportProgress.currentTable = table;
      exportProgress.currentTableIndex = i;
      exportProgress.rowsInCurrentTable = 0;
      exportProgress.tables[i].status = "running";

      console.log(`[export-service] Esportando ${table}...`);
      const rows = await writeJsonlGz(filePath, iterator, (written) => {
        exportProgress.rowsInCurrentTable = written;
        exportProgress.totalRowsSoFar = totalRows + written;
      });
      const bytes = fs.statSync(filePath).size;
      tableResults.push({ table, rows, bytes });
      totalRows += rows;
      exportProgress.tables[i].rows = rows;
      exportProgress.tables[i].status = "done";
      exportProgress.totalRowsSoFar = totalRows;
      console.log(`[export-service]   ${table}: ${rows.toLocaleString()} righe → ${formatBytes(bytes)}`);
    }

    exportProgress.currentTable = null;
    exportProgress.phase = "archiving";

    const manifest = {
      exportId,
      exportedAt: startedAt.toISOString(),
      options: opts,
      tables: tableResults,
    };
    fs.writeFileSync(path.join(tmpDir, "export-manifest.json"), JSON.stringify(manifest, null, 2));

    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      const output = fs.createWriteStream(tmpZip);
      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.pipe(output);
      archive.directory(tmpDir, false);
      archive.finalize();
      output.on("close", () => resolve(fs.readFileSync(tmpZip)));
      archive.on("error", reject);
    });

    const fileName = `bikerlink_export_${ts}.zip`;
    const objectPath = `${EXPORT_OBJECT_PREFIX}/${fileName}`;
    exportProgress.phase = "uploading";
    await uploadBuffer(objectPath, zipBuffer, "application/zip");

    const completedAt = new Date();
    const meta: ExportMeta = {
      id: exportId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      totalRows,
      totalBytes: zipBuffer.length,
      objectPath,
      fileName,
      options: opts,
      tables: tableResults,
    };

    await appendToHistory(meta);
    exportProgress.phase = "done";
    console.log(`[export-service] Export completato: ${objectPath} (${formatBytes(zipBuffer.length)})`);
    return meta;
  } catch (err) {
    exportProgress.phase = "error";
    exportProgress.error = err instanceof Error ? err.message : "Errore export";
    throw err;
  } finally {
    isExporting = false;
    exportProgress.active = false;
    exportProgress.currentTable = null;
    await pool.end();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* no-op */ }
    try { fs.unlinkSync(tmpZip); } catch { /* no-op */ }
  }
}

export async function startExportScheduler(): Promise<void> {
  stopExportScheduler();
  const schedule = await getExportSchedule();
  const intervalMs = getScheduleIntervalMs(schedule);
  if (!intervalMs) return;

  nextAt = addMs(intervalMs);

  function scheduleNext(delayMs: number): void {
    schedulerTimer = setTimeout(async () => {
      schedulerTimer = null;
      nextAt = null;
      try {
        await runExport({});
      } catch (err) {
        console.error("[export-service] scheduled export failed:", err);
      }
      const sched = await getExportSchedule();
      const ms = getScheduleIntervalMs(sched);
      if (ms) {
        nextAt = addMs(ms);
        scheduleNext(ms);
      }
    }, delayMs);
    schedulerTimer.unref?.();
  }

  scheduleNext(intervalMs);
}

export async function downloadExport(fileName: string): Promise<Buffer> {
  const objectPath = `${EXPORT_OBJECT_PREFIX}/${fileName}`;
  return downloadBuffer(objectPath);
}

export async function listExportFiles() {
  return listObjects(EXPORT_OBJECT_PREFIX + "/");
}

export async function runScheduledExport(): Promise<void> {
  try {
    await runExport({});
  } catch (err) {
    console.error("[export-service] scheduled export failed:", err);
  }
}

async function restartScheduler() {
  const schedule = await getExportSchedule();
  const intervalMs = getScheduleIntervalMs(schedule);
  if (!intervalMs) {
    stopExportScheduler();
    return;
  }
  await startExportScheduler();
}
