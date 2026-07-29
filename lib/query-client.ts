import { QueryClient, QueryFunction } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AiKeyMissingError, isAiKeyMissingResponse } from "@/lib/ai-errors";

export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    host = "biker-link.net";
  }

  const url = new URL(`https://${host}`);

  return url.href.replace(/\/$/, "");
}

// ──────────────────────────────────────────────────────────────────────
// SESSION TOKEN (Bearer) — fix sessione persistente per APK Android.
// Il cookie jar nativo di React Native può perdere connect.sid (process killed
// dall'OS, OTA reload del network stack, ecc), causando logout involontari.
// Il backend (login/register/etc) restituisce `sessionToken` nel body della
// risposta; lo salviamo qui in AsyncStorage + cache in memoria per inviarlo
// come Authorization: Bearer <token> su tutte le richieste successive.
// Resta retrocompatibile: il cookie viene comunque inviato (credentials: include).
// ──────────────────────────────────────────────────────────────────────

export const SESSION_TOKEN_KEY = "@bikerlink/session_token";
let _sessionTokenCache: string | null = null;
let _tokenInitialized = false;

/** Ritorna il token in cache (senza I/O). Chiamare initSessionToken() al boot. */
export function getSessionToken(): string | null {
  return _sessionTokenCache;
}

/** Carica il token da AsyncStorage in cache. Idempotente. */
export async function initSessionToken(): Promise<string | null> {
  if (_tokenInitialized) return _sessionTokenCache;
  try {
    const stored = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
    _sessionTokenCache = stored ?? null;
  } catch {
    _sessionTokenCache = null;
  }
  _tokenInitialized = true;
  return _sessionTokenCache;
}

/** Salva il token (login/register/reset-password). */
export async function setSessionToken(token: string | null | undefined): Promise<void> {
  if (typeof token !== "string" || token.length === 0) return;
  _sessionTokenCache = token;
  _tokenInitialized = true;
  try {
    await AsyncStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // no-op: token persistence is best-effort
  }
}

/** Rimuove il token (logout). */
export async function clearSessionToken(): Promise<void> {
  _sessionTokenCache = null;
  _tokenInitialized = true;
  try {
    await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // no-op: token removal is best-effort
  }
}

function buildAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const token = _sessionTokenCache;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Esposto per i pochi fetch fuori da apiRequest/getQueryFn (auth-context). */
export function authFetchHeaders(extra?: Record<string, string>): Record<string, string> {
  return buildAuthHeaders(extra);
}

export class ServerBusyError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super("Server occupato, riprova più tardi");
    this.name = "ServerBusyError";
    this.retryAfter = retryAfter;
  }
}

// When any non-auth endpoint receives a 401, silently re-check /api/auth/me.
// React Query deduplicates concurrent refetches — only one HTTP request is made.
// If the session is truly gone, auth-context will set sessionExpired and redirect.
let _recheckScheduled = false;
function scheduleAuthRecheck() {
  if (_recheckScheduled) return;
  _recheckScheduled = true;
  setTimeout(() => {
    _recheckScheduled = false;
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  }, 300);
}

/**
 * One-shot silent re-auth used by admin endpoints (and anyone who needs to
 * distinguish a real "session expired" from a transient 401). Performs a
 * single GET /api/auth/me with credentials and returns whether the session is
 * still valid. If the session is gone, also invalidates the cached
 * /api/auth/me query so auth-context picks up the change and sets
 * `sessionExpired` globally. The caller decides what to do (retry the
 * original request, surface a session-expired UI, etc).
 */
export async function silentAuthRecheck(): Promise<boolean> {
  const baseUrl = getApiUrl();
  const url = new URL("/api/auth/me", baseUrl);
  try {
    const res = await fetch(url.toString(), {
      headers: buildAuthHeaders(),
      credentials: "include",
    });
    const ok = res.ok && res.status !== 401;
    if (!ok) {
      // Force auth-context to re-evaluate so `sessionExpired` is set globally.
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    }
    return ok;
  } catch {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    return false;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 503) {
      // Task #2825 — Un 503 "chiave AI mancante" NON è un errore transitorio (un retry
      // non risolve): leggi il body e, se è il caso chiave-mancante, lancia
      // AiKeyMissingError così ogni chiamante può mostrare il banner AI dedicato.
      const bodyText = await res.text().catch(() => "");
      let msg503: string | undefined;
      try {
        const parsed = JSON.parse(bodyText) as { message?: unknown };
        if (typeof parsed?.message === "string") msg503 = parsed.message;
      } catch { /* body non JSON */ }
      if (msg503 && isAiKeyMissingResponse(503, msg503)) {
        throw new AiKeyMissingError();
      }
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 3;
      throw new ServerBusyError(isNaN(retryAfter) ? 3 : retryAfter);
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      throw new Error("Server non disponibile. Riprova tra un momento.");
    }
    const text = (await res.text()) || res.statusText;
    if (text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html")) {
      throw new Error("Server non disponibile. Riprova tra un momento.");
    }
    let errorMessage: string | null = null;
    try {
      const json = JSON.parse(text);
      if (typeof json.message === "string") errorMessage = json.message;
    } catch {
      // no-op: fallback to default error message
    }
    throw new Error(errorMessage ?? `${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const baseHeaders: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  const headers = buildAuthHeaders(baseHeaders);

  // Optional explicit timeout: aborts the underlying fetch when the server is
  // slow/unreachable (typical on resume from background with poor network) so
  // the promise rejects instead of hanging forever. Honours an externally
  // provided signal as well.
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let signal: AbortSignal | undefined = opts?.signal;
  if (opts?.timeoutMs && opts.timeoutMs > 0) {
    controller = new AbortController();
    const ms = opts.timeoutMs;
    timer = setTimeout(() => controller!.abort(new Error(`Request timeout after ${ms}ms`)), ms);
    if (opts.signal) {
      const ext = opts.signal as AbortSignal & { reason?: unknown };
      if (ext.aborted) {
        controller.abort(ext.reason);
      } else {
        ext.addEventListener("abort", () => controller!.abort(ext.reason), { once: true });
      }
    }
    signal = controller.signal;
  }

  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal,
    });

    if (res.status === 401 && !route.includes("/api/auth/")) {
      scheduleAuthRecheck();
    }

    await throwIfResNotOk(res);

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const preview = await res.text().catch(() => "");
      console.warn(`[apiRequest] risposta non-JSON da ${route} (Content-Type: ${ct || "assente"}):`, preview.slice(0, 120));
      throw new Error("Risposta del server non valida. Riprova.");
    }

    return res;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Task #4455 — Variante di apiRequest che ritenta in modo trasparente sui 503
 * transitori di init/boot (ServerBusyError). Durante la finestra di init di una
 * nuova istanza autoscale il gate /api/* risponde 503 con Retry-After; invece di
 * mostrare subito "Server occupato" all'utente, riproviamo qualche volta
 * rispettando il Retry-After. Tutti gli altri errori (incluso AiKeyMissingError)
 * vengono propagati immediatamente. Usato dal login (auth-context).
 */
export async function apiRequestWithInitRetry(
  method: string,
  route: string,
  data?: unknown,
  opts?: { maxRetries?: number; maxTotalMs?: number },
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 5;
  const maxTotalMs = opts?.maxTotalMs ?? 20000;
  const start = Date.now();
  let attempt = 0;
  for (;;) {
    try {
      return await apiRequest(method, route, data);
    } catch (err) {
      const canRetry =
        err instanceof ServerBusyError &&
        attempt < maxRetries &&
        Date.now() - start < maxTotalMs;
      if (!canRetry) throw err;
      // Retry-After è in secondi; clamp 1–5s per non bloccare troppo la UI.
      const waitMs = Math.min(Math.max(err.retryAfter, 1), 5) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt++;
    }
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);
    const path = (queryKey[0] as string) ?? "";
    const isAuthQuery = path.includes("/api/auth/");
    const isAdminQuery = path.startsWith("/api/admin");

    const doFetch = () =>
      fetch(url.toString(), {
        headers: buildAuthHeaders(),
        credentials: "include",
        signal,
      });

    let res = await doFetch();

    // Centralized one-shot silent re-auth for admin endpoints.
    // Cookie connect.sid can go stale on Android after cold start while the
    // Bearer token in AsyncStorage is still valid. Re-check /api/auth/me once;
    // if the session is alive, retry the original request silently before
    // surfacing a 401 to the caller. silentAuthRecheck() invalidates
    // /api/auth/me when the session is truly gone, so auth-context flips
    // `sessionExpired` globally for any UI that observes it.
    if (res.status === 401 && !isAuthQuery && isAdminQuery) {
      const stillValid = await silentAuthRecheck();
      if (stillValid) {
        res = await doFetch();
      }
    }

    if (res.status === 401) {
      if (!isAuthQuery && !isAdminQuery) {
        // Non-admin paths keep the legacy debounced recheck.
        scheduleAuthRecheck();
      }
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/**
 * Returns a QueryFunction identical to getQueryFn({ on401: "returnNull" }) but
 * aborts the request after `timeoutMs` milliseconds if the server hasn't
 * responded. When the timeout fires the fetch throws an AbortError which React
 * Query treats as a query error, surfacing isError=true and triggering the
 * "Riprova" path in the UI.
 */
export function getQueryFnWithTimeout<T>(timeoutMs = 15000): QueryFunction<T> {
  const baseFn = getQueryFn<T>({ on401: "returnNull" });
  return (ctx) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const parentSignal = ctx.signal;
    if (parentSignal) {
      const onParentAbort = () => {
        clearTimeout(timer);
        controller.abort((parentSignal as AbortSignal & { reason?: unknown }).reason);
      };
      if (parentSignal.aborted) {
        clearTimeout(timer);
        controller.abort((parentSignal as AbortSignal & { reason?: unknown }).reason);
      } else {
        parentSignal.addEventListener("abort", onParentAbort, { once: true });
      }
    }

    return Promise.resolve(baseFn({ ...ctx, signal: controller.signal })).finally(() => {
      clearTimeout(timer);
    });
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Timeout di default: una query che resta appesa (DB lento, rete) viene
      // abortita dopo 30s e propaga isError → "Riprova" invece di lasciare
      // "Aggiornamento dati..." bloccato per minuti. L'auth query usa la sua
      // authQueryFn dedicata e non è toccata da questo default.
      queryFn: getQueryFnWithTimeout(30000),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: (failureCount, error) => {
        if (error instanceof ServerBusyError) {
          return failureCount < 3;
        }
        return false;
      },
      retryDelay: (_, error) => {
        if (error instanceof ServerBusyError) {
          return error.retryAfter * 1000;
        }
        return 1000;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
