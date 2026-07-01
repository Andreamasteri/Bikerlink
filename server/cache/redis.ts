import Redis, { type RedisOptions } from "ioredis";

/**
 * Centralised ioredis client + helpers.
 *
 * Reads TC_DRAGONFLY_URL (ThinkCentre self-hosted DragonflyDB, drop-in
 * compatible with the ioredis client; legacy TC_REDIS_URL still honoured as
 * fallback). When not set, or when the TC is offline, the module operates in
 * fallback (in-memory) mode.
 *
 * All call sites must tolerate `getRedis()` returning null and fall back to
 * in-memory behaviour. A periodic reconnect is NOT built into ioredis here —
 * re-init/suspend is driven externally by the ThinkCentre monitor.
 *
 * Nota: il circuit breaker quota (ex Upstash) è stato rimosso — DragonflyDB
 * self-hosted non ha tetti di richieste. Il fallback in-memory standard
 * (quando il client non è `available`) resta invariato.
 *
 * NB (Task #5285): i simboli esportati mantengono il nome `*Redis` perché sono
 * cablati a ioredis/Redlock/BullMQ; solo i log/label/commenti citano DragonflyDB.
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

function getRedisUrl(): string | undefined {
  return process.env.TC_DRAGONFLY_URL ?? process.env.TC_REDIS_URL;
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
    // ThinkCentre DragonflyDB è locale: NO retry automatici — la riconnessione
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
    console.log("[DragonflyDB] TC_DRAGONFLY_URL not set — running in fallback (in-memory) mode");
    return;
  }
  try {
    const client = new Redis(url, buildOptions(url));
    client.on("ready", () => {
      state.available = true;
      console.log("[DragonflyDB] connected and ready (TC)");
    });
    client.on("error", (err: unknown) => {
      state.available = false;
      state.lastError = err instanceof Error ? err.message : String(err);
      state.lastErrorAt = Date.now();
    });
    client.on("end", () => {
      state.available = false;
    });
    state.client = client;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    state.lastErrorAt = Date.now();
    console.warn("[DragonflyDB] init failed, fallback mode:", state.lastError);
  }
}

/**
 * Tenta di (ri-)inizializzare la connessione DragonflyDB usando TC_DRAGONFLY_URL.
 * Chiamato dal ThinkCentre monitor quando il TC torna online e la probe è OK.
 * Se già connesso e disponibile, è no-op.
 */
export async function reInitRedis(): Promise<void> {
  const url = getRedisUrl();
  if (!url) {
    console.log("[DragonflyDB] reInitRedis: TC_DRAGONFLY_URL non configurato — skip");
    return;
  }
  // Chiude il client esistente se presente (potrebbe essere in stato di errore).
  if (state.client) {
    if (state.available) {
      console.log("[DragonflyDB] reInitRedis: già connesso e disponibile — skip");
      return;
    }
    try { await state.client.quit(); } catch { /* ignore */ }
    state.client = null;
    state.available = false;
  }
  // Reset per permettere una nuova init.
  initAttempted = false;
  init();
  console.log("[DragonflyDB] reInitRedis: tentativo di riconnessione al TC avviato");
}

/**
 * Sospende DragonflyDB: chiude il client e marca come non disponibile.
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
  console.log("[DragonflyDB] suspendRedis: connessione chiusa (TC offline)");
}

export function getRedis(): Redis | null {
  if (!initAttempted) init();
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
 * Ritorna null se TC_DRAGONFLY_URL non è configurato (modalità fallback in-memory).
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
    console.warn("[DragonflyDB] getBullConnectionOptions parse failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export function isRedisAvailable(): boolean {
  if (!initAttempted) init();
  return state.available;
}

/**
 * Aggiorna il risultato dell'ultima probe TCP DragonflyDB del ThinkCentre monitor.
 * Chiamato dal monitor dopo ogni ciclo di probe.
 */
export function setTcRedisProbeOk(ok: boolean | null): void {
  state.tcProbeOk = ok;
}

export function getRedisStatus() {
  if (!initAttempted) init();
  const url = getRedisUrl();
  const source: "thinkcentre" | "none" =
    process.env.TC_DRAGONFLY_URL ?? process.env.TC_REDIS_URL ? "thinkcentre" : "none";
  return {
    configured: !!url,
    available: state.available,
    source,
    tcProbeOk: state.tcProbeOk,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt ? new Date(state.lastErrorAt).toISOString() : null,
  };
}

/**
 * Crea un client DragonflyDB dedicato al pub/sub (psubscribe/subscribe).
 * Ritorna null se TC_DRAGONFLY_URL non è configurato.
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
    console.warn("[DragonflyDB] createPubSubClient failed:", err instanceof Error ? err.message : err);
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
