import Redis, { type RedisOptions } from "ioredis";

/**
 * Centralised ioredis client + helpers.
 *
 * Reads REDIS_URL (Upstash/VPS Redis, normally rediss://). TC_DRAGONFLY_URL is
 * retained only as a legacy fallback for local/dev compatibility. When neither
 * URL is set, or when the configured provider is offline, the module operates
 * in fallback (in-memory) mode.
 *
 * All call sites must tolerate `getRedis()` returning null and fall back to
 * in-memory behaviour. The cloud Redis connection uses bounded automatic
 * reconnects; the legacy TC path remains compatible with the same client.
 *
 * Nota: il fallback in-memory standard (quando il client non è `available`)
 * resta invariato.
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
  // REDIS_URL is the canonical cloud/VPS provider. Keep the TC variable only
  // as a legacy fallback so old local deployments do not break silently.
  return process.env.REDIS_URL?.trim() || process.env.TC_DRAGONFLY_URL?.trim();
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
    // Cloud/VPS Redis needs bounded reconnects after transient network blips.
    retryStrategy: (times) => Math.min(times * 1_000, 30_000),
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
    console.log("[Redis] REDIS_URL not set — running in fallback (in-memory) mode");
    return;
  }
  try {
    const client = new Redis(url, buildOptions(url));
    client.on("ready", () => {
      state.available = true;
      console.log("[Redis] connected and ready");
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
    console.warn("[Redis] init failed, fallback mode:", state.lastError);
  }
}

/**
 * Tenta di (ri-)inizializzare la connessione Redis usando REDIS_URL.
 * Il monitor ThinkCentre può ancora chiamare questa funzione per compatibilità
 * con il vecchio percorso TC; con REDIS_URL viene riconnesso il provider cloud.
 */
export async function reInitRedis(): Promise<void> {
  const url = getRedisUrl();
  if (!url) {
    console.log("[Redis] reInitRedis: nessun URL configurato — skip");
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
  init();
  console.log("[Redis] reInitRedis: tentativo di riconnessione avviato");
}

/**
 * Chiude il client Redis e lo marca come non disponibile.
 * Chiamato dal monitor legacy quando il provider remoto va offline.
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
  state.lastError = "Redis offline — sospeso dal monitor";
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
 * Ritorna null se nessun URL Redis è configurato (modalità fallback in-memory).
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
      retryStrategy: (times) => Math.min(times * 1_000, 30_000),
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
  return state.available;
}

/**
 * Aggiorna il risultato dell'ultima probe del monitor legacy.
 * Chiamato dal monitor dopo ogni ciclo di probe.
 */
export function setTcRedisProbeOk(ok: boolean | null): void {
  state.tcProbeOk = ok;
}

export function getRedisStatus() {
  if (!initAttempted) init();
  const url = getRedisUrl();
  const source: "redis_url" | "thinkcentre" | "none" =
    process.env.REDIS_URL?.trim()
      ? "redis_url"
      : process.env.TC_DRAGONFLY_URL?.trim()
        ? "thinkcentre"
        : "none";
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
 * Crea un client Redis dedicato al pub/sub (psubscribe/subscribe).
 * Ritorna null se nessun URL Redis è configurato.
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
      retryStrategy: (times) => Math.min(times * 1_000, 30_000),
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
