import Redis, { type RedisOptions } from "ioredis";

/**
 * Centralised ioredis client + helpers (Task #2517).
 *
 * Lazy singleton: instantiates only when REDIS_URL is set. All call sites must
 * tolerate `getRedis()` returning null and fall back to in-memory behaviour.
 * Connection errors never throw — they flip `available` to false and let the
 * caller proceed without Redis. A periodic reconnect attempt is built into
 * ioredis via `retryStrategy`.
 */

type ClientState = {
  client: Redis | null;
  available: boolean;
  lastError: string | null;
  lastErrorAt: number | null;
};

const state: ClientState = {
  client: null,
  available: false,
  lastError: null,
  lastErrorAt: null,
};

let initAttempted = false;

function buildOptions(url: string): RedisOptions {
  const opts: RedisOptions = {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    // Fail-fast: i comandi emessi mentre la connessione è giù falliscono
    // subito (niente coda offline) → il chiamante ricade sul fallback
    // in-memory (cache miss / lock locale) senza bloccare.
    enableOfflineQueue: false,
    // Timeout per singolo tentativo di connessione TLS.
    connectTimeout: 8_000,
    // Riconnessione automatica con backoff esponenziale capped (max 30s).
    // Con Redis cloud (Upstash) la connessione è affidabile: dopo un blip di
    // rete vogliamo riconnetterci da soli, non restare offline fino al
    // restart del backend. Il backoff cap a 30s evita il flooding (al più un
    // tentativo ogni 30s) e l'handler `error` qui sotto assorbe gli errori
    // senza loggarli per-evento; il filtro console.error in server/index.ts
    // copre eventuali "[ioredis] Unhandled error event" residui.
    retryStrategy: (times: number) => Math.min(times * 1000, 30_000),
  };
  // Upstash richiede TLS. Con un URL `rediss://` ioredis abilita già il TLS,
  // ma impostiamo esplicitamente `tls: {}` per coprire gli edge case (SNI /
  // servername derivato dall'host). Mai su URL `redis://` plaintext.
  if (url.startsWith("rediss://")) {
    opts.tls = {};
  }
  return opts;
}

function init(): void {
  if (initAttempted) return;
  initAttempted = true;
  const url = process.env.REDIS_URL;
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
 * BullMQ richiede `maxRetriesPerRequest: null` sulle sue connessioni bloccanti
 * (i Worker usano `BRPOPLPUSH`); passargli il client cache condiviso
 * (`maxRetriesPerRequest: 2`) fa lanciare a runtime
 * "Your redis options maxRetriesPerRequest must be null" e impedisce l'avvio
 * dei worker. Passiamo quindi a Queue/Worker un *oggetto opzioni* derivato da
 * REDIS_URL: BullMQ crea e gestisce le proprie connessioni (duplicando
 * correttamente quella bloccante), separate dal client cache.
 *
 * Ritorna null se REDIS_URL non è configurato (modalità fallback in-memory).
 */
export function getBullConnectionOptions(): RedisOptions | null {
  const url = process.env.REDIS_URL;
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
      connectTimeout: 8_000,
      retryStrategy: (times: number) => Math.min(times * 1000, 30_000),
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

export function getRedisStatus() {
  if (!initAttempted) init();
  return {
    configured: !!process.env.REDIS_URL,
    available: state.available,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt ? new Date(state.lastErrorAt).toISOString() : null,
  };
}

/**
 * Crea un client Redis dedicato al pub/sub (psubscribe/subscribe).
 *
 * NON usa `duplicate()` sul client cache perché quello ha
 * `enableOfflineQueue:false` — con Upstash (TLS remoto) il duplicate
 * tenta `psubscribe` prima che la connessione sia ready e fallisce
 * immediatamente. Questo client usa `enableOfflineQueue:true` +
 * `maxRetriesPerRequest:null` (richiesto per connessioni bloccanti)
 * e si riconnette autonomamente.
 *
 * Ritorna null se REDIS_URL non è configurato.
 */
export function createPubSubClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const opts: RedisOptions = {
      lazyConnect: false,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      connectTimeout: 8_000,
      retryStrategy: (times: number) => Math.min(times * 1000, 30_000),
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
