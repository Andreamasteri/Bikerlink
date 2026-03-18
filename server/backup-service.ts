import { exec } from "child_process";
import { promisify } from "util";
import zlib from "zlib";
import archiver from "archiver";
import fs from "fs";
import os from "os";
import path from "path";
import {
  uploadBuffer,
  downloadBuffer,
  deleteObject,
  listObjects,
  type StorageFile,
} from "./objectStorage";
import { db } from "./db";
import { appSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const execAsync = promisify(exec);

const DB_PREFIX = "backup/database";
const MEDIA_PREFIX = "backup/media";
const RETENTION_DAYS = 90;

let dbSchedulerTimer: NodeJS.Timeout | null = null;
let mediaSchedulerTimer: NodeJS.Timeout | null = null;
let dbNextAt: Date | null = null;
let mediaNextAt: Date | null = null;
let isBackingUp = false;
let isRestoringDb = false;

function addMs(ms: number): Date {
  return new Date(Date.now() + ms);
}

const INTERVAL_DB_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MEDIA_MS = 7 * 24 * 60 * 60 * 1000;

export interface BackupFile extends StorageFile {
  path: string;
}

async function deriveLastBackup(prefix: string): Promise<{ timestamp: string; size: number } | null> {
  try {
    const files = await listObjects(prefix);
    if (files.length === 0) return null;
    files.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
    const latest = files[0];
    return { timestamp: latest.createdTime, size: latest.size };
  } catch {
    return null;
  }
}

export async function getBackupStatus() {
  const [lastDbBackup, lastMediaBackup] = await Promise.all([
    deriveLastBackup(DB_PREFIX),
    deriveLastBackup(MEDIA_PREFIX),
  ]);
  return {
    scheduled: dbSchedulerTimer !== null,
    lastDbBackup,
    lastMediaBackup,
    isBackingUp,
    isRestoringDb,
    nextScheduled: dbNextAt?.toISOString() ?? null,
    nextMediaScheduled: mediaNextAt?.toISOString() ?? null,
    configured: true,
  };
}

export async function startScheduler() {
  await startDbScheduler();
  await startMediaScheduler();
}

async function startDbScheduler() {
  if (dbSchedulerTimer) return;
  const enabled = await isAutoBackupEnabled();
  if (!enabled) return;

  dbNextAt = addMs(INTERVAL_DB_MS);
  dbSchedulerTimer = setInterval(async () => {
    try {
      const stillEnabled = await isAutoBackupEnabled();
      if (!stillEnabled) { stopDbScheduler(); return; }
      await backupDatabase();
      await purgeOldBackups();
      dbNextAt = addMs(INTERVAL_DB_MS);
    } catch (err) {
      console.error("[backup-service] Scheduled DB backup failed:", err);
      dbNextAt = addMs(INTERVAL_DB_MS);
    }
  }, INTERVAL_DB_MS);

  console.log("[backup-service] DB scheduler started (every 24h)");
}

async function startMediaScheduler() {
  if (mediaSchedulerTimer) return;
  const enabled = await isAutoBackupEnabled();
  if (!enabled) return;

  mediaNextAt = addMs(INTERVAL_MEDIA_MS);
  mediaSchedulerTimer = setInterval(async () => {
    try {
      const stillEnabled = await isAutoBackupEnabled();
      if (!stillEnabled) { stopMediaScheduler(); return; }
      await backupMedia();
      await purgeOldBackups();
      mediaNextAt = addMs(INTERVAL_MEDIA_MS);
    } catch (err) {
      console.error("[backup-service] Scheduled media backup failed:", err);
      mediaNextAt = addMs(INTERVAL_MEDIA_MS);
    }
  }, INTERVAL_MEDIA_MS);

  console.log("[backup-service] Media scheduler started (every 7 days)");
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

async function isAutoBackupEnabled(): Promise<boolean> {
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, "backup_auto_enabled"));
    if (rows.length === 0) return true;
    return rows[0].value !== "false";
  } catch {
    return true;
  }
}

export async function setAutoBackupEnabled(enabled: boolean) {
  try {
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, "backup_auto_enabled"));
    if (existing.length > 0) {
      await db.update(appSettings).set({ value: enabled ? "true" : "false" }).where(eq(appSettings.key, "backup_auto_enabled"));
    } else {
      await db.insert(appSettings).values({
        key: "backup_auto_enabled",
        value: enabled ? "true" : "false",
        description: "Backup automatico (Replit Object Storage)",
      });
    }
    if (enabled) {
      await startScheduler();
    } else {
      stopScheduler();
    }
  } catch (err) {
    console.error("[backup-service] setAutoBackupEnabled error:", err);
    throw err;
  }
}

function getObjectPath(type: "db" | "media", fileName: string): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const prefix = type === "db" ? DB_PREFIX : MEDIA_PREFIX;
  return `${prefix}/${year}/${month}/${fileName}`;
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

export async function backupDatabase(): Promise<{ path: string; name: string; size: number }> {
  if (isBackingUp) throw new Error("Backup già in corso");
  isBackingUp = true;

  const ts = getTimestamp();
  const tmpSql = path.join(os.tmpdir(), `bikerlink_db_${ts}.sql`);
  const tmpGz = tmpSql + ".gz";

  try {
    const dbUrl = process.env.DATABASE_URL!;
    await execAsync(`pg_dump "${dbUrl}" --clean --if-exists -f "${tmpSql}" --no-password`);

    await new Promise<void>((resolve, reject) => {
      const inp = fs.createReadStream(tmpSql);
      const out = fs.createWriteStream(tmpGz);
      const gz = zlib.createGzip({ level: 9 });
      inp.pipe(gz).pipe(out);
      out.on("finish", resolve);
      out.on("error", reject);
      inp.on("error", reject);
    });

    const buf = fs.readFileSync(tmpGz);
    const fileName = `bikerlink_db_${ts}.sql.gz`;
    const objectPath = getObjectPath("db", fileName);
    await uploadBuffer(objectPath, buf, "application/gzip");

    console.log(`[backup-service] DB backup salvato: ${objectPath} (${buf.length} bytes)`);
    return { path: objectPath, name: fileName, size: buf.length };
  } finally {
    isBackingUp = false;
    try { fs.unlinkSync(tmpSql); } catch {}
    try { fs.unlinkSync(tmpGz); } catch {}
  }
}

export async function backupMedia(): Promise<{ path: string; name: string; size: number }> {
  if (isBackingUp) throw new Error("Backup già in corso");
  isBackingUp = true;

  const ts = getTimestamp();
  const tmpZip = path.join(os.tmpdir(), `bikerlink_media_${ts}.zip`);

  try {
    const mediaDir = process.env.PRIVATE_OBJECT_DIR
      ? path.join(process.env.PRIVATE_OBJECT_DIR, "..")
      : "/home/runner/workspace/.data/uploads";

    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      const output = fs.createWriteStream(tmpZip);
      const archive = archiver("zip", { zlib: { level: 6 } });
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

    const fileName = `bikerlink_media_${ts}.zip`;
    const objectPath = getObjectPath("media", fileName);
    await uploadBuffer(objectPath, zipBuffer, "application/zip");

    console.log(`[backup-service] Media backup salvato: ${objectPath} (${zipBuffer.length} bytes)`);
    return { path: objectPath, name: fileName, size: zipBuffer.length };
  } finally {
    isBackingUp = false;
    try { fs.unlinkSync(tmpZip); } catch {}
  }
}

export async function restoreDatabase(objectPath: string): Promise<void> {
  if (isRestoringDb) throw new Error("Ripristino già in corso");
  isRestoringDb = true;

  const tmpGz = path.join(os.tmpdir(), `bikerlink_restore_${Date.now()}.sql.gz`);
  const tmpSql = tmpGz.replace(".sql.gz", ".sql");

  try {
    const buf = await downloadBuffer(objectPath);
    fs.writeFileSync(tmpGz, buf);

    await new Promise<void>((resolve, reject) => {
      const inp = fs.createReadStream(tmpGz);
      const out = fs.createWriteStream(tmpSql);
      const gz = zlib.createGunzip();
      inp.pipe(gz).pipe(out);
      out.on("finish", resolve);
      out.on("error", reject);
      inp.on("error", reject);
    });

    const dbUrl = process.env.DATABASE_URL!;
    await execAsync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f "${tmpSql}" --no-password`);
    console.log("[backup-service] Database ripristinato con successo");
  } finally {
    isRestoringDb = false;
    try { fs.unlinkSync(tmpGz); } catch {}
    try { fs.unlinkSync(tmpSql); } catch {}
  }
}

export async function listBackups(): Promise<{ db: BackupFile[]; media: BackupFile[] }> {
  const [dbFiles, mediaFiles] = await Promise.all([
    listObjects(DB_PREFIX).catch(() => [] as StorageFile[]),
    listObjects(MEDIA_PREFIX).catch(() => [] as StorageFile[]),
  ]);

  const toBackupFile = (f: StorageFile): BackupFile => ({
    ...f,
    path: f.name,
    name: f.name.split("/").pop() ?? f.name,
  });

  const db2 = dbFiles.map(toBackupFile).sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  const media = mediaFiles.map(toBackupFile).sort((a, b) => b.createdTime.localeCompare(a.createdTime));

  return { db: db2, media };
}

export async function purgeOldBackups(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const all = await listBackups();
  const toDelete = [...all.db, ...all.media].filter(
    (f) => new Date(f.createdTime) < cutoff
  );
  let deleted = 0;
  for (const f of toDelete) {
    try {
      await deleteObject(f.path);
      deleted++;
      console.log(`[backup-service] Eliminato backup vecchio: ${f.name}`);
    } catch (err) {
      console.error(`[backup-service] Impossibile eliminare ${f.name}:`, err);
    }
  }
  return deleted;
}

export async function downloadBackupBuffer(objectPath: string): Promise<Buffer> {
  return downloadBuffer(objectPath);
}
