import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { storage } from "./storage";

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 ore

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
    const row = await storage.getAppSetting(key);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function upsertSetting(key: string, value: string, _description?: string) {
  await storage.upsertAppSetting(key, value, undefined);
}

async function upsertJsonSetting(key: string, value: unknown, _description?: string) {
  await storage.upsertAppSetting(key, undefined, value);
}

async function readJsonSetting<T>(key: string): Promise<T | null> {
  try {
    const row = await storage.getAppSetting(key);
    if (!row || row.valueJson == null) return null;
    return row.valueJson as T;
  } catch {
    return null;
  }
}

/**
 * Rileva se siamo nell'ambiente di produzione Replit.
 *
 * NOTA TECNICA: In questo progetto start-backend.sh imposta NODE_ENV=production
 * anche nel dev workspace (necessario per Metro proxy e static-build routing),
 * quindi NODE_ENV non può essere usato come discriminante dev/prod.
 * I flag affidabili sono quelli iniettati esclusivamente dall'infrastruttura
 * Replit nella deployed app:
 *   - REPLIT_DEPLOYMENT="1"       → flag canonico Replit per deployed app
 *   - REPLIT_INTERNAL_APP_DOMAIN  → dominio interno, solo in produzione
 */
function isProductionEnvironment(): boolean {
  if (process.env.REPLIT_DEPLOYMENT === "1") return true;
  if (process.env.REPLIT_INTERNAL_APP_DOMAIN) return true;
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

/**
 * Esegue un child process con argomenti separati (nessuna interpolazione di stringa)
 * e restituisce stdout/stderr completi. Rigetta la promise se il processo esce con
 * codice != 0.
 *
 * SECURITY: `bin` è sempre un valore letterale hardcoded nei call site di questa
 * funzione ("pg_dump" o "psql") — non deriva mai da input utente, richieste HTTP,
 * o valori del database. La funzione non è esposta pubblicamente. Come misura di
 * difesa in profondità viene applicato un allowlist esplicito che rigetta qualsiasi
 * eseguibile non previsto, rendendo impossibile l'injection anche in caso di futura
 * modifica accidentale dei call site.
 *
 * nosec: child_process.spawn — bin è verificato contro allowlist server-side
 */
const ALLOWED_BINS = new Set(["pg_dump", "psql"]);

function runProcess(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  if (!ALLOWED_BINS.has(bin)) {
    return Promise.reject(new Error(`runProcess: eseguibile non consentito: "${bin}"`));
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${bin} exited with code ${code}\n${stderr}`));
      }
    });
    proc.on("error", reject);
  });
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

    // pg_dump: dump completo del database di produzione in un file SQL
    await runProcess("pg_dump", [
      urls.prodUrl,
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "-f", tmpSql,
      "--no-password",
    ]);
    console.log("[sync-service] pg_dump completato");

    // psql: restore sul database di sviluppo — ON_ERROR_STOP=1 per fail-fast
    await runProcess("psql", [
      urls.devUrl,
      "-f", tmpSql,
      "--no-password",
      "-v", "ON_ERROR_STOP=1",
    ]);
    console.log("[sync-service] psql restore completato");

    const meta: SyncMeta = { startedAt, finishedAt: new Date().toISOString(), ok: true };
    await upsertJsonSetting("sync.last", meta, "Ultimo sync prod→dev");
    await upsertSetting("sync.next_at", new Date(Date.now() + INTERVAL_MS).toISOString(), "Prossimo sync prod→dev");
    console.log("[sync-service] Sync completato con successo");
    return { ok: true };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const meta: SyncMeta = { startedAt, finishedAt: new Date().toISOString(), ok: false, error: errMsg };
    await upsertJsonSetting("sync.last", meta, "Ultimo sync prod→dev").catch(() => {});
    await upsertSetting("sync.next_at", new Date(Date.now() + INTERVAL_MS).toISOString(), "Prossimo sync prod→dev").catch(() => {});
    console.error("[sync-service] Errore sync:", errMsg);
    return { ok: false, error: errMsg };
  } finally {
    isSyncing = false;
    try { fs.unlinkSync(tmpSql); } catch (err) { console.warn("[sync-service] Failed to remove temp SQL file:", tmpSql, err); }
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

  console.log(`[sync-service] Scheduler avviato — prossimo sync tra 6h (${nextAt})`);
}

export function stopSyncScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log("[sync-service] Scheduler sync fermato");
  }
}
