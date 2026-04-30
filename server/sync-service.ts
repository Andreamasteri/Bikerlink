import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { db } from "./db";
import { appSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const execAsync = promisify(exec);

const INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 ore

let syncTimer: NodeJS.Timeout | null = null;
let isSyncing = false;

interface SyncMeta {
  startedAt: string;
  finishedAt?: string;
  ok: boolean;
  error?: string;
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

async function upsertJsonSetting(key: string, value: unknown, description?: string) {
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key));
  if (existing.length > 0) {
    await db.update(appSettings).set({ valueJson: value as Record<string, unknown>, updatedAt: new Date() }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, valueJson: value as Record<string, unknown>, description });
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

function isProductionEnvironment(): boolean {
  // REPLIT_DEPLOYMENT="1" è impostato solo nella deployed app Replit (mai in dev workspace)
  if (process.env.REPLIT_DEPLOYMENT === "1") return true;
  // REPLIT_INTERNAL_APP_DOMAIN è impostato solo nell'ambiente di produzione Replit
  if (process.env.REPLIT_INTERNAL_APP_DOMAIN) return true;
  // NODE_ENV="production" NON è un indicatore affidabile in questo progetto:
  // start-backend.sh lo imposta anche nel dev workspace.
  // DEV_SYNC_ALLOWED=1 permette override esplicito se NODE_ENV=production ma siamo in dev.
  if (process.env.NODE_ENV === "production" && !process.env.DEV_SYNC_ALLOWED) return true;
  return false;
}

function getSyncUrls(): { prodUrl: string; devUrl: string } | null {
  const prodUrl = process.env.PROD_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;
  if (!prodUrl || !devUrl) return null;
  if (prodUrl === devUrl) return null;
  return { prodUrl, devUrl };
}

export function isSyncAvailable(): boolean {
  if (isProductionEnvironment()) return false;
  const urls = getSyncUrls();
  return urls !== null;
}

export async function syncProdToDev(): Promise<{ ok: boolean; error?: string }> {
  if (isProductionEnvironment()) {
    const msg = "Sync bloccato: ambiente di produzione rilevato";
    console.warn("[sync-service]", msg);
    return { ok: false, error: msg };
  }

  const urls = getSyncUrls();
  if (!urls) {
    const msg = process.env.PROD_DATABASE_URL
      ? "PROD_DATABASE_URL e DATABASE_URL puntano allo stesso database — sync annullato"
      : "PROD_DATABASE_URL non configurato";
    console.warn("[sync-service]", msg);
    return { ok: false, error: msg };
  }

  if (isSyncing) {
    return { ok: false, error: "Sync già in corso" };
  }

  isSyncing = true;
  const startedAt = new Date().toISOString();

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const tmpSql = path.join(os.tmpdir(), `bikerlink_sync_${ts}.sql`);

  try {
    console.log("[sync-service] Avvio sync produzione → sviluppo...");

    await execAsync(
      `pg_dump "${urls.prodUrl}" --clean --if-exists -f "${tmpSql}" --no-password --no-owner --no-privileges`
    );
    console.log("[sync-service] pg_dump completato");

    await execAsync(
      `psql "${urls.devUrl}" -f "${tmpSql}" --no-password -v ON_ERROR_STOP=1`
    );
    console.log("[sync-service] psql restore completato");

    const meta: SyncMeta = { startedAt, finishedAt: new Date().toISOString(), ok: true };
    await upsertJsonSetting("sync.last", meta, "Ultimo sync prod→dev");
    await upsertSetting("sync.next_at", new Date(Date.now() + INTERVAL_MS).toISOString(), "Prossimo sync prod→dev");
    console.log("[sync-service] Sync completato con successo");
    return { ok: true };
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    const meta: SyncMeta = { startedAt, finishedAt: new Date().toISOString(), ok: false, error: errMsg };
    await upsertJsonSetting("sync.last", meta, "Ultimo sync prod→dev").catch(() => {});
    await upsertSetting("sync.next_at", new Date(Date.now() + INTERVAL_MS).toISOString(), "Prossimo sync prod→dev").catch(() => {});
    console.error("[sync-service] Errore sync:", errMsg);
    return { ok: false, error: errMsg };
  } finally {
    isSyncing = false;
    try { fs.unlinkSync(tmpSql); } catch {}
  }
}

export async function getSyncStatus() {
  const available = isSyncAvailable();
  const inProgress = isSyncing;
  const [lastMeta, nextAt] = await Promise.all([
    readJsonSetting<SyncMeta>("sync.last"),
    readSetting("sync.next_at"),
  ]);

  return {
    available,
    inProgress,
    lastSync: lastMeta ?? null,
    nextScheduledAt: nextAt ?? null,
  };
}

export function startSyncScheduler() {
  if (isProductionEnvironment()) {
    console.log("[sync-service] Ambiente di produzione — scheduler sync disabilitato");
    return;
  }
  if (!getSyncUrls()) {
    console.log("[sync-service] PROD_DATABASE_URL non configurato o uguale a DATABASE_URL — scheduler sync non avviato");
    return;
  }

  if (syncTimer) clearInterval(syncTimer);

  const nextAt = new Date(Date.now() + INTERVAL_MS).toISOString();
  upsertSetting("sync.next_at", nextAt, "Prossimo sync prod→dev").catch(() => {});

  syncTimer = setInterval(async () => {
    try {
      await syncProdToDev();
      await upsertSetting("sync.next_at", new Date(Date.now() + INTERVAL_MS).toISOString(), "Prossimo sync prod→dev");
    } catch (err) {
      console.error("[sync-service] Scheduled sync failed:", err);
    }
  }, INTERVAL_MS);

  console.log(`[sync-service] Scheduler avviato — prossimo sync tra 12h (${nextAt})`);
}

export function stopSyncScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log("[sync-service] Scheduler sync fermato");
  }
}
