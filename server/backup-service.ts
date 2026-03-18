import { exec } from "child_process";
import { promisify } from "util";
import zlib from "zlib";
import archiver from "archiver";
import fs from "fs";
import os from "os";
import path from "path";
import {
  uploadFile,
  downloadFile,
  deleteFile,
  listAllBackupFiles,
  isGoogleDriveConfigured,
  type DriveFile,
} from "./google-drive";
import { db } from "./db";
import { appSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const execAsync = promisify(exec);

const DB_FOLDER = "backup/database";
const MEDIA_FOLDER = "backup/media";
const RETENTION_DAYS = 90;

let schedulerTimer: NodeJS.Timeout | null = null;
let lastDbBackup: { timestamp: string; size: number } | null = null;
let lastMediaBackup: { timestamp: string; size: number } | null = null;
let isBackingUp = false;
let isRestoringDb = false;

export function getBackupStatus() {
  const now = Date.now();
  const nextScheduled = schedulerTimer
    ? new Date(now + getNextRunMs()).toISOString()
    : null;
  return {
    scheduled: schedulerTimer !== null,
    lastDbBackup,
    lastMediaBackup,
    isBackingUp,
    isRestoringDb,
    nextScheduled,
    configured: isGoogleDriveConfigured(),
  };
}

let nextRunMs = 24 * 60 * 60 * 1000;
function getNextRunMs() {
  return nextRunMs;
}

export async function startScheduler() {
  if (schedulerTimer) return;
  const enabled = await isAutoBackupEnabled();
  if (!enabled) return;
  if (!isGoogleDriveConfigured()) return;

  schedulerTimer = setInterval(async () => {
    try {
      const stillEnabled = await isAutoBackupEnabled();
      if (!stillEnabled) {
        stopScheduler();
        return;
      }
      await backupDatabase();
      await purgeOldBackups();
    } catch (err) {
      console.error("[backup-service] Scheduled DB backup failed:", err);
    }
  }, 24 * 60 * 60 * 1000);

  nextRunMs = 24 * 60 * 60 * 1000;
  console.log("[backup-service] Scheduler started (every 24h)");
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[backup-service] Scheduler stopped");
  }
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
      await db.insert(appSettings).values({ key: "backup_auto_enabled", value: enabled ? "true" : "false", description: "Backup automatico su Google Drive" });
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

function getFolderPath(type: "db" | "media"): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const base = type === "db" ? DB_FOLDER : MEDIA_FOLDER;
  return `${base}/${year}/${month}`;
}

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

export async function backupDatabase(): Promise<{ id: string; name: string; size: number }> {
  if (!isGoogleDriveConfigured()) throw new Error("Google Drive non configurato");
  if (isBackingUp) throw new Error("Backup già in corso");
  isBackingUp = true;

  const tmpFile = path.join(os.tmpdir(), `bikerlink_db_${getTimestamp()}.sql`);
  const gzFile = tmpFile + ".gz";

  try {
    const dbUrl = process.env.DATABASE_URL!;
    await execAsync(`pg_dump "${dbUrl}" -f "${tmpFile}" --no-password`);
    await new Promise<void>((resolve, reject) => {
      const inp = fs.createReadStream(tmpFile);
      const out = fs.createWriteStream(gzFile);
      const gz = zlib.createGzip({ level: 9 });
      inp.pipe(gz).pipe(out);
      out.on("finish", resolve);
      out.on("error", reject);
      inp.on("error", reject);
    });

    const buf = fs.readFileSync(gzFile);
    const fileName = `bikerlink_db_${getTimestamp()}.sql.gz`;
    const folderPath = getFolderPath("db");
    const result = await uploadFile(fileName, buf, "application/gzip", folderPath);
    lastDbBackup = { timestamp: new Date().toISOString(), size: buf.length };
    console.log(`[backup-service] DB backup uploaded: ${fileName} (${buf.length} bytes)`);
    return { id: result.id, name: fileName, size: buf.length };
  } finally {
    isBackingUp = false;
    try { fs.unlinkSync(tmpFile); } catch {}
    try { fs.unlinkSync(gzFile); } catch {}
  }
}

export async function backupMedia(): Promise<{ id: string; name: string; size: number }> {
  if (!isGoogleDriveConfigured()) throw new Error("Google Drive non configurato");
  if (isBackingUp) throw new Error("Backup già in corso");
  isBackingUp = true;

  const tmpZip = path.join(os.tmpdir(), `bikerlink_media_${getTimestamp()}.zip`);
  try {
    const mediaDir = process.env.OBJECT_STORAGE_PATH || "/home/runner/workspace/.data/uploads";
    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      const output = fs.createWriteStream(tmpZip);
      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.pipe(output);
      if (fs.existsSync(mediaDir)) {
        archive.directory(mediaDir, false);
      }
      archive.finalize();
      output.on("close", () => resolve(fs.readFileSync(tmpZip)));
      archive.on("error", reject);
    });

    const fileName = `bikerlink_media_${getTimestamp()}.zip`;
    const folderPath = getFolderPath("media");
    const result = await uploadFile(fileName, zipBuffer, "application/zip", folderPath);
    lastMediaBackup = { timestamp: new Date().toISOString(), size: zipBuffer.length };
    console.log(`[backup-service] Media backup uploaded: ${fileName} (${zipBuffer.length} bytes)`);
    return { id: result.id, name: fileName, size: zipBuffer.length };
  } finally {
    isBackingUp = false;
    try { fs.unlinkSync(tmpZip); } catch {}
  }
}

export async function restoreDatabase(fileId: string): Promise<void> {
  if (!isGoogleDriveConfigured()) throw new Error("Google Drive non configurato");
  if (isRestoringDb) throw new Error("Ripristino già in corso");
  isRestoringDb = true;

  const tmpGz = path.join(os.tmpdir(), `bikerlink_restore_${Date.now()}.sql.gz`);
  const tmpSql = tmpGz.replace(".sql.gz", ".sql");

  try {
    const buf = await downloadFile(fileId);
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
    await execAsync(`psql "${dbUrl}" -f "${tmpSql}" --no-password`);
    console.log("[backup-service] Database restored successfully");
  } finally {
    isRestoringDb = false;
    try { fs.unlinkSync(tmpGz); } catch {}
    try { fs.unlinkSync(tmpSql); } catch {}
  }
}

export async function listBackups(): Promise<{ db: DriveFile[]; media: DriveFile[] }> {
  if (!isGoogleDriveConfigured()) return { db: [], media: [] };
  const [dbFiles, mediaFiles] = await Promise.all([
    listAllBackupFiles("backup/database").catch(() => [] as DriveFile[]),
    listAllBackupFiles("backup/media").catch(() => [] as DriveFile[]),
  ]);
  dbFiles.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  mediaFiles.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  return { db: dbFiles, media: mediaFiles };
}

export async function purgeOldBackups(): Promise<number> {
  if (!isGoogleDriveConfigured()) return 0;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const all = await listBackups();
  const toDelete = [...all.db, ...all.media].filter(
    (f) => new Date(f.createdTime) < cutoff
  );
  let deleted = 0;
  for (const f of toDelete) {
    try {
      await deleteFile(f.id);
      deleted++;
      console.log(`[backup-service] Purged old backup: ${f.name}`);
    } catch (err) {
      console.error(`[backup-service] Failed to delete ${f.name}:`, err);
    }
  }
  return deleted;
}
