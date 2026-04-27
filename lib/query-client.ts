import { QueryClient, QueryFunction } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    host = "biker-link.replit.app";
  }

  let url = new URL(`https://${host}`);

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
  } catch {}
}

/** Rimuove il token (logout). */
export async function clearSessionToken(): Promise<void> {
  _sessionTokenCache = null;
  _tokenInitialized = true;
  try {
    await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {}
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
 * still valid. Does NOT mutate React Query cache — the caller decides what to
 * do (retry the original request, mark session expired, etc).
 */
export async function silentAuthRecheck(): Promise<boolean> {
  const baseUrl = getApiUrl();
  const url = new URL("/api/auth/me", baseUrl);
  try {
    const res = await fetch(url.toString(), {
      headers: buildAuthHeaders(),
      credentials: "include",
    });
    if (res.status === 401) return false;
    if (!res.ok) return false;
    return true;
  } catch {
    return false;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 503) {
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
    } catch {}
    throw new Error(errorMessage ?? `${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const baseHeaders: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  const headers = buildAuthHeaders(baseHeaders);

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (res.status === 401 && !route.includes("/api/auth/")) {
    scheduleAuthRecheck();
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url.toString(), {
      headers: buildAuthHeaders(),
      credentials: "include",
      signal,
    });

    if (res.status === 401) {
      const isAuthQuery = (queryKey[0] as string)?.includes("/api/auth/");
      if (!isAuthQuery) {
        scheduleAuthRecheck();
      }
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
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
