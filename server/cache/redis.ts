import Redis, { type RedisOptions } from "ioredis";

/**
 * Centralised ioredis client + helpers.
 *
 * Reads TC_REDIS_URL (ThinkCentre self-hosted Redis). When not set, or when
 * the TC is offline, the module operates in fallback (in-memory) mode.
 *
 * All call sites must tolerate `getRedis()` returning null and fall back to
 * in-memory behaviour. A periodic reconnect is NOT built into ioredis here —
 * re-init/suspend is driven externally by the ThinkCentre monitor.
 */

type ClientState = {
  client: Redis | null;
  available: boolean;
  lastError: string | null;
  lastErrorAt: number | null;
  tcProbeOk: boolean | null;
};

const state: ClientState = {
  client: null,
  available: false,
  lastError: null,
  lastErrorAt: null,
  tcProbeOk: null,
};

let initAttempted = false;

// ── Upstash quota circuit breaker (kept for compatibility / generic rate-limit protection) ──
// If any Redis server returns a quota error, we open a cooldown circuit.
const QUOTA_ERROR_RE = /max requests? limit exceeded|max daily request|max monthly request|ERR max requests/i;
const QUOTA_COOLDOWN_MS = 15 * 60_000;
let circuitOpenUntil = 0;

function circuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

/** True se l'errore indica un tetto richieste esaurito. */
export function isRedisQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return QUOTA_ERROR_RE.test(msg);
}

/**
 * Apre il circuito quando la quota è esaurita: marca Redis come non
 * disponibile per `QUOTA_COOLDOWN_MS`. Idempotente: logga una sola volta.
 */
export function noteRedisQuotaExhausted(source: string): void {
  const now = Date.now();
  const wasOpen = circuitOpen();
  circuitOpenUntil = now + QUOTA_COOLDOWN_MS;
  state.available = false;
  state.lastError = "quota esaurita (max requests limit exceeded)";
  state.lastErrorAt = now;
  if (!wasOpen) {
    console.warn(
      `[Redis] quota esaurita (${source}) — circuito aperto per ${Math.round(QUOTA_COOLDOWN_MS / 60_000)}min, fallback in-memory/DB`,
    );
  }
}

/**
 * Da chiamare nei catch dei call-site Redis: se l'errore è quota esaurita apre
 * il circuito. Ritorna true se ha riconosciuto (e gestito) un errore di quota.
 */
export function noteRedisErrorMaybeQuota(source: string, err: unknown): boolean {
  if (isRedisQuotaError(err)) {
    noteRedisQuotaExhausted(source);
    return true;
  }
  return false;
}

function getRedisUrl(): string | undefined {
  return process.env.TC_REDIS_URL;
}

function buildOptions(url: string): RedisOptions {
  const opts: RedisOptions = {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    // Fail-fast: comandi emessi mentre la connessione è giù falliscono subito
    // → il chiamante ricade sul fallback in-memory senza bloccare.
    enableOfflineQueue: false,
    connectTimeout: 3_000,
    // ThinkCentre Redis è locale: NO retry automatici — la riconnessione
    // è gestita dal ThinkCentre monitor via reInitRedis().
    retryStrategy: () => null,
  };
  if (url.startsWith("rediss://")) {
    opts.tls = {};
  }
  return opts;
}

function init(): void {
  if (initAttempted) return;
  initAttempted = true;
  const url = getRedisUrl();
  if (!url) {
    console.log("[Redis] TC_REDIS_URL not set — running in fallback (in-memory) mode");
    return;
  }
  try {
    const client = new Redis(url, buildOptions(url));
    client.on("ready", () => {
      state.available = true;
      console.log("[Redis] connected and ready (TC)");
    });
    client.on("error", (err: unknown) => {
      state.available = false;
      state.lastError = err instanceof Error ? err.message : String(err);
      state.lastErrorAt = Date.now();
      if (isRedisQuotaError(err)) noteRedisQuotaExhausted("client-error");
    });
    client.on("end", () => {
      state.available = false;
    });
    state.client = client;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    state.lastErrorAt = Date.now();
    console.warn("[Redis] init failed, fallback mode:", state.lastError);
  }
}

/**
 * Tenta di (ri-)inizializzare la connessione Redis usando TC_REDIS_URL.
 * Chiamato dal ThinkCentre monitor quando il TC torna online e la probe Redis è OK.
 * Se Redis è già connesso e disponibile, è no-op.
 */
export async function reInitRedis(): Promise<void> {
  const url = getRedisUrl();
  if (!url) {
    console.log("[Redis] reInitRedis: TC_REDIS_URL non configurato — skip");
    return;
  }
  // Chiude il client esistente se presente (potrebbe essere in stato di errore).
  if (state.client) {
    if (state.available) {
      console.log("[Redis] reInitRedis: già connesso e disponibile — skip");
      return;
    }
    try { await state.client.quit(); } catch { /* ignore */ }
    state.client = null;
    state.available = false;
  }
  // Reset per permettere una nuova init.
  initAttempted = false;
  circuitOpenUntil = 0;
  init();
  console.log("[Redis] reInitRedis: tentativo di riconnessione al TC avviato");
}

/**
 * Sospende Redis: chiude il client e marca come non disponibile.
 * Chiamato dal ThinkCentre monitor quando il TC va offline.
 * Nessuna reconnect automatica — sarà reInitRedis() a ripristinare.
 */
export async function suspendRedis(): Promise<void> {
  if (!state.client && !state.available) {
    return; // già sospeso
  }
  if (state.client) {
    try { await state.client.quit(); } catch { /* ignore */ }
    state.client = null;
  }
  state.available = false;
  state.lastError = "TC offline — sospeso dal monitor";
  state.lastErrorAt = Date.now();
  // Consenti una futura reInit (non bloccare su initAttempted=true).
  initAttempted = false;
  console.log("[Redis] suspendRedis: connessione chiusa (TC offline)");
}

export function getRedis(): Redis | null {
  if (!initAttempted) init();
  if (circuitOpen()) return null;
  return state.available ? state.client : null;
}

/** Raw client (may be disconnected). Use for Redlock / pub-sub which manage their own state. */
export function getRawRedis(): Redis | null {
  if (!initAttempted) init();
  return state.client;
}

/**
 * Opzioni di connessione dedicate a BullMQ.
 *
 * BullMQ richiede `maxRetriesPerRequest: null` sulle sue connessioni bloccanti.
 * Ritorna null se TC_REDIS_URL non è configurato (modalità fallback in-memory).
 */
export function getBullConnectionOptions(): RedisOptions | null {
  const url = getRedisUrl();
  if (!url) return null;
  try {
    const u = new URL(url);
    const opts: RedisOptions = {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 6379,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: 3_000,
      retryStrategy: () => null,
    };
    if (url.startsWith("rediss://")) {
      opts.tls = {};
    }
    return opts;
  } catch (err) {
    console.warn("[Redis] getBullConnectionOptions parse failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export function isRedisAvailable(): boolean {
  if (!initAttempted) init();
  if (circuitOpen()) return false;
  return state.available;
}

/**
 * Aggiorna il risultato dell'ultima probe TCP Redis del ThinkCentre monitor.
 * Chiamato dal monitor dopo ogni ciclo di probe.
 */
export function setTcRedisProbeOk(ok: boolean | null): void {
  state.tcProbeOk = ok;
}

export function getRedisStatus() {
  if (!initAttempted) init();
  const url = getRedisUrl();
  const source: "thinkcentre" | "none" = process.env.TC_REDIS_URL ? "thinkcentre" : "none";
  return {
    configured: !!url,
    available: state.available && !circuitOpen(),
    source,
    tcProbeOk: state.tcProbeOk,
    quotaCircuitOpen: circuitOpen(),
    quotaCircuitResetsAt: circuitOpen() ? new Date(circuitOpenUntil).toISOString() : null,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt ? new Date(state.lastErrorAt).toISOString() : null,
  };
}

/**
 * Crea un client Redis dedicato al pub/sub (psubscribe/subscribe).
 * Ritorna null se TC_REDIS_URL non è configurato.
 */
export function createPubSubClient(): Redis | null {
  const url = getRedisUrl();
  if (!url) return null;
  try {
    const opts: RedisOptions = {
      lazyConnect: false,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      connectTimeout: 3_000,
      retryStrategy: () => null,
    };
    if (url.startsWith("rediss://")) {
      opts.tls = {};
    }
    return new Redis(url, opts);
  } catch (err) {
    console.warn("[Redis] createPubSubClient failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function quitRedis(): Promise<void> {
  if (state.client) {
    try {
      await state.client.quit();
    } catch {
      /* ignore */
    }
    state.client = null;
    state.available = false;
  }
}
