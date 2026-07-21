import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { storage } from "./storage";
import { sendSystemAlertPushToAdmins } from "./push-notifications";

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

async function upsertSetting(key: string, value: string, description?: string) {
  await storage.upsertAppSetting(key, value, undefined, description);
}

async function upsertJsonSetting(key: string, value: unknown, description?: string) {
  await storage.upsertAppSetting(key, undefined, value, description);
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
  // Dopo il cutover Neon: DATABASE_URL = Neon main (produzione),
  // DATABASE_URL_DEV = branch dev Neon (creato in task #991).
  // PROD_DATABASE_URL era il vecchio DB Replit managed — non più usato.
  const prodUrl = process.env.DATABASE_URL;
  const devUrl = process.env.DATABASE_URL_DEV;
  if (!prodUrl || !devUrl) return null;
  if (prodUrl === devUrl) return null;
  return { prodUrl, devUrl };
}

/**
 * Verifica che pg_dump e psql siano disponibili nel PATH.
 * Restituisce il nome del primo binario mancante, oppure null se entrambi
 * sono presenti.
 *
 * Usa `which` in modo sincrono — chiamato solo al boot e a ogni
 * `isSyncAvailable()`, non nel percorso critico delle richieste HTTP.
 */
function findMissingBin(): string | null {
  for (const bin of ["pg_dump", "psql"]) {
    const result = spawnSync("which", [bin], { encoding: "utf8" });
    if (result.status !== 0 || !result.stdout?.trim()) {
      return bin;
    }
  }
  return null;
}

/** Flag one-shot: impedisce di inviare la push più di una volta per sessione. */
let missingBinAlertSent = false;

// --- Alert push per il sync scheduler ---
// Latch: armato quando una push di FALLIMENTO sync è stata realmente inviata.
// La push di RIENTRO ("✅ sync ripristinato") parte SOLO se il latch è armato,
// così l'admin non riceve un all-clear per un fallimento mai notificato.
// Il latch viene consumato (riportato a false) quando la push di rientro parte.
let syncFailAlertSent = false;

// Throttle semplice per le push di fallimento: evita di spammare se il sync
// viene triggerato manualmente più volte in pochi minuti.
// TTL: 30 minuti — inferiore all'intervallo schedulato (6h), ma protegge dai
// trigger manuali ravvicinati.
const SYNC_FAIL_ALERT_TTL_MS = 30 * 60 * 1000;
let syncFailAlertLastSentAt = 0;

function shouldSendSyncFailAlert(): boolean {
  const now = Date.now();
  if (now - syncFailAlertLastSentAt < SYNC_FAIL_ALERT_TTL_MS) return false;
  syncFailAlertLastSentAt = now;
  return true;
}

export function isSyncAvailable(): boolean {
  if (isProductionEnvironment()) return false;
  const urls = getSyncUrls();
  if (urls === null) return false;
  return findMissingBin() === null;
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

  const missingBin = findMissingBin();
  if (missingBin) {
    const msg = `Sync non disponibile: ${missingBin} non trovato nel PATH`;
    console.warn("[sync-service]", msg);
    return { ok: false, error: msg };
  }

  const urls = getSyncUrls();
  if (!urls) {
    const msg = process.env.DATABASE_URL_DEV
      ? "DATABASE_URL e DATABASE_URL_DEV puntano allo stesso database — sync annullato"
      : "DATABASE_URL_DEV non configurato (branch dev Neon non ancora creato)";
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
  const inProduction = isProductionEnvironment();
  const urls = getSyncUrls();
  const missingBin = (!inProduction && urls !== null) ? findMissingBin() : null;
  const available = !inProduction && urls !== null && missingBin === null;
  const inProgress = isSyncing;
  const [lastMeta, nextAt] = await Promise.all([
    readJsonSetting<SyncMeta>("sync.last"),
    readSetting("sync.next_at"),
  ]);

  return {
    available,
    unavailableReason: missingBin ? `${missingBin} non trovato nel PATH` : null,
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
    console.log("[sync-service] DATABASE_URL_DEV non configurato o uguale a DATABASE_URL — scheduler sync non avviato");
    return;
  }

  const missingBin = findMissingBin();
  if (missingBin) {
    const msg = `Sync prod→dev non disponibile: ${missingBin} non trovato nel PATH. Installare postgresql-client nel container.`;
    console.warn("[sync-service]", msg);
    if (!missingBinAlertSent) {
      missingBinAlertSent = true;
      sendSystemAlertPushToAdmins(
        "Sync prod→dev non disponibile",
        `${missingBin} non trovato nel PATH — il sync automatico non partirà finché non viene installato postgresql-client.`,
        { type: "sync_missing_bin", bin: missingBin },
      ).catch((err: unknown) => {
        console.warn("[sync-service] Impossibile inviare push notifica admin:", err);
      });
    }
    return;
  }

  if (syncTimer) clearInterval(syncTimer);

  const nextAt = new Date(Date.now() + INTERVAL_MS).toISOString();
  upsertSetting("sync.next_at", nextAt, "Prossimo sync prod→dev").catch(() => {});

  syncTimer = setInterval(async () => {
    try {
      const result = await syncProdToDev();
      await upsertSetting("sync.next_at", new Date(Date.now() + INTERVAL_MS).toISOString(), "Prossimo sync prod→dev");

      if (!result.ok) {
        // Fallimento sync — arma il latch e invia push (throttled).
        syncFailAlertSent = true;
        if (shouldSendSyncFailAlert()) {
          const errSnippet = result.error
            ? result.error.slice(0, 200)
            : "Errore sconosciuto";
          sendSystemAlertPushToAdmins(
            "⚠️ Sync prod→dev fallito",
            `Il sync automatico del database di sviluppo ha fallito: ${errSnippet}`,
            { type: "sync_prod_to_dev_failed", error: result.error ?? null, ts: new Date().toISOString() },
          ).catch((pushErr: unknown) => {
            console.warn("[sync-service] Impossibile inviare push notifica fallimento sync:", pushErr);
          });
        }
      } else if (syncFailAlertSent) {
        // Sync tornato OK dopo uno o più fallimenti — invia all-clear e consuma il latch.
        syncFailAlertSent = false;
        sendSystemAlertPushToAdmins(
          "✅ Sync prod→dev ripristinato",
          "Il sync automatico del database di sviluppo è tornato operativo con successo.",
          { type: "sync_prod_to_dev_recovered", ts: new Date().toISOString() },
        ).catch((pushErr: unknown) => {
          console.warn("[sync-service] Impossibile inviare push notifica ripristino sync:", pushErr);
        });
      }
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
