import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "node:crypto";
import { ZipArchive } from "archiver";
import fs from "fs";
import os from "os";
import path from "path";
import { uploadBuffer } from "./objectStorage";
import { db } from "./db";
import { appSettings } from "@shared/db";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { uploadBackupToGDrive } from "./google-drive-backup";
import { getDeployEnvironment, getProductionDatabaseUrl } from "./lib/database-environment";

const execFileAsync = promisify(execFile);

const DEFAULT_DB_HOURS = 24;
const DEFAULT_MEDIA_HOURS = 24;

export const BACKUP_OBJECT_PREFIX = ".private/backups";

let dbSchedulerTimer: NodeJS.Timeout | null = null;
let mediaSchedulerTimer: NodeJS.Timeout | null = null;
let dbNextAt: Date | null = null;
let mediaNextAt: Date | null = null;
let isBackingUp = false;

function addMs(ms: number): Date {
  return new Date(Date.now() + ms);
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertProductionBackupTarget(): string {
  if (getDeployEnvironment() !== "production") {
    throw new Error("Backup DB/media consentiti esclusivamente in production.");
  }
  return getProductionDatabaseUrl();
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
  await storage.upsertAppSetting(key, value, undefined, description);
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
  await storage.upsertAppSetting(key, undefined, value, description);
}

export interface BackupFrequency {
  dbHours: number;
  mediaHours: number;
}

function normalizeFrequencyHours(raw: string | null, fallback: number): number {
  const hours = raw == null ? NaN : Number(raw);
  return Number.isInteger(hours) && hours >= 1 && hours <= 8760 ? hours : fallback;
}

export async function getBackupFrequency(): Promise<BackupFrequency> {
  const [dbVal, mediaVal] = await Promise.all([
    readSetting("backup.freq_db_hours"),
    readSetting("backup.freq_media_hours"),
  ]);
  return {
    dbHours: normalizeFrequencyHours(dbVal, DEFAULT_DB_HOURS),
    mediaHours: normalizeFrequencyHours(mediaVal, DEFAULT_MEDIA_HOURS),
  };
}

export async function setBackupFrequency(freq: Partial<BackupFrequency>): Promise<BackupFrequency> {
  const current = await getBackupFrequency();
  const next: BackupFrequency = {
    dbHours: freq.dbHours ?? current.dbHours,
    mediaHours: freq.mediaHours ?? current.mediaHours,
  };
  await Promise.all([
    upsertSetting("backup.freq_db_hours", String(next.dbHours), "Frequenza backup DB (ore)"),
    upsertSetting("backup.freq_media_hours", String(next.mediaHours), "Frequenza backup media (ore)"),
  ]);
  await restartSchedulerWithNewFrequency();
  return next;
}

export interface LastBackupMeta {
  timestamp: string;
  size: number;
  objectPath?: string;
  fileName?: string;
  sha256?: string;
  format?: "custom" | "zip";
  environment?: "production";
}

async function saveLastBackup(type: "db" | "media", meta: LastBackupMeta) {
  await upsertJsonSetting(
    type === "db" ? "backup.last_db" : "backup.last_media",
    meta,
    type === "db" ? "Ultimo backup DB su Object Storage" : "Ultimo backup media su Object Storage"
  );
}

export async function getLastBackupMeta(type: "db" | "media"): Promise<LastBackupMeta | null> {
  return readJsonSetting<LastBackupMeta>(type === "db" ? "backup.last_db" : "backup.last_media");
}

export async function getBackupStatus() {
  const [lastDb, lastMedia, freq, autoEnabled] = await Promise.all([
    readJsonSetting<LastBackupMeta>("backup.last_db"),
    readJsonSetting<LastBackupMeta>("backup.last_media"),
    getBackupFrequency(),
    isAutoBackupEnabled(),
  ]);
  return {
    scheduled: dbSchedulerTimer !== null,
    autoEnabled,
    lastDbBackup: lastDb ?? null,
    lastMediaBackup: lastMedia ?? null,
    isBackingUp,
    nextScheduled: dbNextAt?.toISOString() ?? null,
    nextMediaScheduled: mediaNextAt?.toISOString() ?? null,
    storage: { type: "object_storage" as const, prefix: BACKUP_OBJECT_PREFIX },
    dbHours: freq.dbHours,
    mediaHours: freq.mediaHours,
    configured: true,
    productionOnly: true,
  };
}

async function isAutoBackupEnabled(): Promise<boolean> {
  if (process.env.BACKUP_AUTO_ENABLED === "false") return false;
  if (process.env.BACKUP_AUTO_ENABLED === "true") return true;
  const val = await readSetting("backup_auto_enabled");
  if (val === null) return true;
  return val !== "false";
}

export async function setAutoBackupEnabled(enabled: boolean) {
  await upsertSetting("backup_auto_enabled", enabled ? "true" : "false", "Backup automatico (Object Storage)");
  if (enabled) {
    await startScheduler();
  } else {
    stopScheduler();
  }
}

export async function backupDatabase(): Promise<{ path: string; name: string; size: number; sha256: string }> {
  if (isBackingUp) throw new Error("Backup già in corso");
  isBackingUp = true;

  const ts = getTimestamp();
  const tmpDump = path.join(os.tmpdir(), `bikerlink_db_${ts}.dump`);

  try {
    const dbUrl = assertProductionBackupTarget();
    await execFileAsync("pg_dump", [
      dbUrl,
      "--format=custom",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--file",
      tmpDump,
      "--no-password",
    ]);

    const buf = fs.readFileSync(tmpDump);
    const digest = sha256(buf);
    const fileName = `bikerlink_db_${ts}.dump`;
    const objectPath = `${BACKUP_OBJECT_PREFIX}/db/${fileName}`;

    await uploadBuffer(objectPath, buf, "application/octet-stream");
    const meta: LastBackupMeta = {
      timestamp: new Date().toISOString(),
      size: buf.length,
      sha256: digest,
      format: "custom",
      environment: "production",
      objectPath,
      fileName,
    };
    await saveLastBackup("db", meta);

    console.log(`[backup-service] DB backup production su Object Storage: ${objectPath} (${buf.length} bytes, sha256=${digest})`);

    uploadBackupToGDrive(buf, fileName, "application/octet-stream").catch((err) => {
      console.warn("[backup-service] GDrive upload DB fallito (non bloccante):", err);
    });

    return { path: objectPath, name: fileName, size: buf.length, sha256: digest };
  } finally {
    isBackingUp = false;
    try { fs.unlinkSync(tmpDump); } catch { /* no-op: cleanup */ }
  }
}

export async function backupMedia(): Promise<{ path: string; name: string; size: number; sha256: string }> {
  if (isBackingUp) throw new Error("Backup già in corso");
  isBackingUp = true;

  const ts = getTimestamp();
  const tmpZip = path.join(os.tmpdir(), `bikerlink_media_${ts}.zip`);

  try {
    assertProductionBackupTarget();
    const mediaDir = process.env.MEDIA_UPLOAD_DIR
      || process.env.UPLOAD_DIR
      || path.join(process.cwd(), ".data", "uploads");

    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      const output = fs.createWriteStream(tmpZip);
      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.pipe(output);
      if (fs.existsSync(mediaDir)) {
        archive.directory(mediaDir, false);
      } else {
        archive.append("(nessun file media)", { name: "README.txt" });
      }
      archive.finalize();
      output.on("close", () => resolve(fs.readFileSync(tmpZip)));
      archive.on("error", reject);
    });

    const digest = sha256(zipBuffer);
    const fileName = `bikerlink_media_${ts}.zip`;
    const objectPath = `${BACKUP_OBJECT_PREFIX}/media/${fileName}`;

    await uploadBuffer(objectPath, zipBuffer, "application/zip");
    const meta: LastBackupMeta = {
      timestamp: new Date().toISOString(),
      size: zipBuffer.length,
      sha256: digest,
      format: "zip",
      environment: "production",
      objectPath,
      fileName,
    };
    await saveLastBackup("media", meta);

    console.log(`[backup-service] Media backup production su Object Storage: ${objectPath} (${zipBuffer.length} bytes, sha256=${digest})`);

    uploadBackupToGDrive(zipBuffer, fileName, "application/zip").catch((err) => {
      console.warn("[backup-service] GDrive upload media fallito (non bloccante):", err);
    });

    return { path: objectPath, name: fileName, size: zipBuffer.length, sha256: digest };
  } finally {
    isBackingUp = false;
    try { fs.unlinkSync(tmpZip); } catch { /* no-op: cleanup */ }
  }
}


async function startDbScheduler() {
  stopDbScheduler();
  const enabled = await isAutoBackupEnabled();
  if (!enabled) return;
  const { dbHours } = await getBackupFrequency();
  const intervalMs = dbHours * 60 * 60 * 1000;
  dbNextAt = addMs(intervalMs);
  dbSchedulerTimer = setInterval(async () => {
    try {
      const stillEnabled = await isAutoBackupEnabled();
      if (!stillEnabled) { stopDbScheduler(); return; }
      await backupDatabase();
      const { dbHours: newHours } = await getBackupFrequency();
      dbNextAt = addMs(newHours * 60 * 60 * 1000);
    } catch (err) {
      console.error("[backup-service] Scheduled DB backup failed:", err);
      const { dbHours: newHours } = await getBackupFrequency();
      dbNextAt = addMs(newHours * 60 * 60 * 1000);
    }
  }, intervalMs);
  console.log(`[backup-service] DB scheduler started (every ${dbHours}h)`);
}

async function startMediaScheduler() {
  stopMediaScheduler();
  const enabled = await isAutoBackupEnabled();
  if (!enabled) return;
  const { mediaHours } = await getBackupFrequency();
  const intervalMs = mediaHours * 60 * 60 * 1000;
  mediaNextAt = addMs(intervalMs);
  mediaSchedulerTimer = setInterval(async () => {
    try {
      const stillEnabled = await isAutoBackupEnabled();
      if (!stillEnabled) { stopMediaScheduler(); return; }
      await backupMedia();
      const { mediaHours: newHours } = await getBackupFrequency();
      mediaNextAt = addMs(newHours * 60 * 60 * 1000);
    } catch (err) {
      console.error("[backup-service] Scheduled media backup failed:", err);
      const { mediaHours: newHours } = await getBackupFrequency();
      mediaNextAt = addMs(newHours * 60 * 60 * 1000);
    }
  }, intervalMs);
  console.log(`[backup-service] Media scheduler started (every ${mediaHours}h)`);
}

function stopDbScheduler() {
  if (dbSchedulerTimer) {
    clearInterval(dbSchedulerTimer);
    dbSchedulerTimer = null;
    dbNextAt = null;
    console.log("[backup-service] DB scheduler stopped");
  }
}

function stopMediaScheduler() {
  if (mediaSchedulerTimer) {
    clearInterval(mediaSchedulerTimer);
    mediaSchedulerTimer = null;
    mediaNextAt = null;
    console.log("[backup-service] Media scheduler stopped");
  }
}

export function stopScheduler() {
  stopDbScheduler();
  stopMediaScheduler();
}

export async function startScheduler() {
  if (getDeployEnvironment() !== "production") {
    stopScheduler();
    console.warn("[backup-service] Scheduler non avviato: target non-production.");
    return;
  }
  await startDbScheduler();
  await startMediaScheduler();
}

async function restartSchedulerWithNewFrequency() {
  const enabled = await isAutoBackupEnabled();
  if (!enabled) return;
  await startDbScheduler();
  await startMediaScheduler();
}
