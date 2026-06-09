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

function buildOptions(): RedisOptions {
  return {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    // Timeout per singolo tentativo di connessione TLS.
    connectTimeout: 8_000,
    retryStrategy(times: number) {
      // Dopo 4 tentativi (~30s totali) desistiamo silenziosamente.
      // In ambiente cloud Redis TCP non è raggiungibile dal router → il
      // flooding di ETIMEDOUT nei log non porta benefici; il fallback
      // in-memory gestisce tutto. Se Redis torna disponibile (es. restart
      // del server di casa), il prossimo boot ricomincia da zero.
      if (times > 4) return null;
      return Math.min(1000 * 2 ** Math.min(times, 4), 15_000);
    },
    reconnectOnError() {
      return true;
    },
  };
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
    const client = new Redis(url, buildOptions());
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

/** Raw client (may be disconnected). Use for BullMQ / Redlock which manage their own state. */
export function getRawRedis(): Redis | null {
  if (!initAttempted) init();
  return state.client;
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
