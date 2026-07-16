/**
 * AI Hub client — Task #153
 *
 * Client leggero per l'`ai-hub` che gira sul ThinkCentre (pm2, porta 4405),
 * esposto via nginx reverse-proxy su `https://tc.biker-link.net/ai-hub/`.
 * L'hub è il servizio centrale condiviso tra BikerLink e BikerBlog: file
 * sharing (`/files/*`), monitor VRAM (`/vram`) e ricerca semantica del manuale
 * (`/nadir/search`) sui file in `~/agent-shared/` del TC.
 *
 * Autenticazione a due livelli:
 *   1. Cloudflare Access (edge) — header Service Token via `server/lib/cf-access.ts`.
 *   2. Gate token dell'hub — header `X-Hub-Gate-Token: <AI_HUB_GATE_TOKEN>`,
 *      validato dall'hub stesso su ogni chiamata.
 *
 * Variabili d'ambiente (secret Replit):
 *   AI_HUB_URL         — base URL dell'hub (es. https://tc.biker-link.net/ai-hub)
 *   AI_HUB_GATE_TOKEN  — gate token (stessa stringa di HUB_GATE_TOKEN nel .env dell'hub)
 *
 * Comportamento: NON fatale. Ogni errore (config mancante, timeout, HTTP ≥400,
 * rete) ritorna `{ ok: false, error }` con un warning loggato, mai un throw.
 * Lo stato di raggiungibilità (`isHubAvailable`) è pilotato dal watchdog
 * (setHubReachable) — vedi server/ai/watchdog/collectors/ai-hub-collector.ts —
 * ed è ottimista (true) finché una probe non lo marca giù, così i tool provano
 * comunque l'hub e i fallback locali (es. searchNadir) scattano sull'errore.
 */

import { cfAccessHeaders } from "./cf-access";

const AI_HUB_URL = (process.env.AI_HUB_URL ?? "").trim().replace(/\/+$/, "");
const AI_HUB_GATE_TOKEN = (process.env.AI_HUB_GATE_TOKEN ?? "").trim();

/** Timeout uniforme per ogni chiamata all'hub. */
const HUB_TIMEOUT_MS = 8_000;

export interface HubResult<T = unknown> {
  ok: boolean;
  /** HTTP status quando disponibile. */
  status?: number;
  /** Corpo JSON della risposta (solo quando ok). */
  data?: T;
  /** Messaggio d'errore leggibile (solo quando !ok). */
  error?: string;
}

// Raggiungibilità corrente dell'hub — aggiornata dalla probe del watchdog.
// Ottimista al boot: finché una probe non lo marca giù, i tool provano l'hub.
let hubReachable = true;
// Traccia se almeno una probe (successo O fallimento) è stata eseguita.
// Rimane false se il collector ha saltato ogni ciclo (es. TC spento al boot).
let hubProbeRan = false;

/** true se ENTRAMBI i secret (URL + gate token) sono configurati. */
export function isHubConfigured(): boolean {
  return AI_HUB_URL.length > 0 && AI_HUB_GATE_TOKEN.length > 0;
}

/**
 * true se l'hub è configurato E l'ultima probe del watchdog non lo ha marcato
 * irraggiungibile. I tool TC-side usano questo gate per decidere se chiamare
 * l'hub o degradare con grazia.
 */
export function isHubAvailable(): boolean {
  return isHubConfigured() && hubReachable;
}

/**
 * true se il collector ha eseguito almeno una probe reale (successo o
 * fallimento) in questa sessione. false se ogni ciclo è stato skippato
 * (es. TC spento dal boot: il flag ottimista al boot non vale come probe).
 */
export function hasHubBeenProbed(): boolean {
  return hubProbeRan;
}

/** Aggiorna lo stato di raggiungibilità (chiamato dalla probe del watchdog). */
export function setHubReachable(reachable: boolean): void {
  hubReachable = reachable;
  hubProbeRan = true;
}

/**
 * Reimposta lo stato in-process al valore di boot.
 * Usato esclusivamente nei test per isolare i casi.
 * @internal
 */
export function resetHubState(): void {
  hubReachable = true;
  hubProbeRan = false;
}

/** Base URL dell'hub (senza slash finale), o "" se non configurato. */
export function getHubBaseUrl(): string {
  return AI_HUB_URL;
}

function hubHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "X-Hub-Gate-Token": AI_HUB_GATE_TOKEN,
    ...cfAccessHeaders(),
    ...(extra ?? {}),
  };
}

/** Normalizza un path relativo/assoluto verso l'hub in "/path". */
function normalizePath(path: string): string {
  const p = (path ?? "").trim();
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

async function hubFetch<T = unknown>(
  path: string,
  init: { method: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown },
): Promise<HubResult<T>> {
  if (!isHubConfigured()) {
    return { ok: false, error: "AI Hub non configurato (AI_HUB_URL / AI_HUB_GATE_TOKEN mancanti)" };
  }

  let url = AI_HUB_URL + normalizePath(path);
  if (init.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === null) continue;
      qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HUB_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method,
      signal: ctrl.signal,
      headers:
        init.method === "POST"
          ? hubHeaders({ "Content-Type": "application/json" })
          : hubHeaders(),
      body: init.method === "POST" ? JSON.stringify(init.body ?? {}) : undefined,
    });

    let data: unknown = undefined;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const detail =
        (data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error)
          : undefined) ?? `HTTP ${res.status}`;
      console.warn(`[ai-hub] ${init.method} ${path} → ${res.status}: ${detail}`);
      return { ok: false, status: res.status, error: detail };
    }

    return { ok: true, status: res.status, data: data as T };
  } catch (err) {
    const msg = (err as Error)?.name === "AbortError" ? `timeout ${HUB_TIMEOUT_MS}ms` : (err as Error)?.message ?? String(err);
    console.warn(`[ai-hub] ${init.method} ${path} fallito (non-fatal): ${msg}`);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** GET su un endpoint dell'hub con query-string opzionale. Mai throw. */
export function hubGet<T = unknown>(path: string, params?: Record<string, unknown>): Promise<HubResult<T>> {
  return hubFetch<T>(path, { method: "GET", query: params });
}

/** POST JSON su un endpoint dell'hub. Mai throw. */
export function hubPost<T = unknown>(path: string, body: unknown): Promise<HubResult<T>> {
  return hubFetch<T>(path, { method: "POST", body });
}
