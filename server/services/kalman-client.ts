/**
 * Kalman Filter Client — BikerLink
 *
 * Client HTTP verso il servizio Kalman self-hosted sul ThinkCentre
 * (infra/self-host/kalman/). Il servizio NON è esposto direttamente su
 * Cloudflare: è raggiunto attraverso il `thinkcentre-agent` (pubblico su
 * tc.biker-link.net) che fa da reverse-proxy sul path `/kalman/*`.
 *
 * Autenticazione riusata da quell'host:
 *   - X-Agent-Token       (secret THINKCENTRE_AGENT_TOKEN)
 *   - Cloudflare Access   (CF-Access-Client-Id / CF-Access-Client-Secret via cfAccessHeaders)
 *
 * Variabili d'ambiente:
 *   KALMAN_SERVICE_URL   URL base del proxy Kalman, es. https://tc.biker-link.net/kalman
 *                        Se assente, il client è considerato NON configurato e ogni
 *                        chiamata degrada con grazia (ritorna null) senza errori.
 *
 * RESILIENZA (contratto Task #47): ogni metodo ritorna `null` se il servizio non
 * è configurato / non è raggiungibile / risponde con errore. NON lancia MAI: il
 * modulo di correzione DR/GPS non deve crashare né bloccare l'ingestione della
 * telemetria quando il ThinkCentre è spento o il tunnel è giù.
 */

import { cfAccessHeaders } from "../lib/cf-access";

const TIMEOUT_MS = 4_000;

/** Stima dead-reckoning al momento della riacquisizione GPS. */
export interface DrEstimate {
  /** velocità stimata (m/s) */
  speed: number;
  /** heading stimato (gradi, 0..360) */
  heading: number;
  /** latitudine stimata (opzionale, per diagnostica/estensioni future) */
  lat?: number;
  /** longitudine stimata (opzionale) */
  lon?: number;
}

/** Misura GPS osservata alla riacquisizione del fix. */
export interface GpsObservation {
  /** velocità osservata (m/s) */
  speed: number;
  /** heading osservato (gradi, 0..360) */
  heading: number;
  /** latitudine osservata (opzionale) */
  lat?: number;
  /** longitudine osservata (opzionale) */
  lon?: number;
}

/** Corpo di una osservazione inviata al filtro. */
export interface KalmanObservationInput {
  /** identificativo utente/rider (max 128 char) */
  userId: string;
  dr: DrEstimate;
  gps: GpsObservation;
  /** accuratezza del fix GPS in metri (opzionale ma raccomandata: pesa l'osservazione) */
  accuracy?: number;
  /** timestamp del campione in ms epoch (default: now lato servizio) */
  timestamp?: number;
}

/** Bias stimati e relativa incertezza restituiti dal filtro. */
export interface KalmanBiases {
  /** bias di velocità stimato (m/s): drSpeed - gpsSpeed atteso */
  speedBias: number;
  /** bias di heading stimato (gradi) */
  headingBias: number;
  /** deviazione standard del bias di velocità (m/s) */
  speedBiasStdDev: number;
  /** deviazione standard del bias di heading (gradi) */
  headingBiasStdDev: number;
  /** varianza del bias di velocità */
  speedBiasVariance: number;
  /** varianza del bias di heading */
  headingBiasVariance: number;
}

/** Stato del filtro restituito da /update e /state/:userId. */
export interface KalmanState {
  userId: string;
  biases: KalmanBiases;
  /** numero di campioni assorbiti dal filtro per questo utente */
  sampleCount: number;
  /** timestamp dell'ultimo aggiornamento (ms epoch) */
  updatedAt: number;
  /** ultima osservazione (scostamenti) usata */
  lastObservation: {
    speedDeviation: number;
    headingDeviation: number;
    accuracy: number | null;
    accuracyScale: number;
  };
  /** indice interno del filtro (numero di step) */
  filterIndex: number | null;
}

function baseUrl(): string | null {
  const raw = process.env.KALMAN_SERVICE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/** true se il client è configurato (KALMAN_SERVICE_URL impostato). */
export function isKalmanConfigured(): boolean {
  return baseUrl() !== null;
}

function buildHeaders(json: boolean): Record<string, string> {
  const h: Record<string, string> = { ...cfAccessHeaders() };
  const agentToken = process.env.THINKCENTRE_AGENT_TOKEN?.trim();
  if (agentToken) h["X-Agent-Token"] = agentToken;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function kalmanFetch(path: string, init: RequestInit): Promise<Response | null> {
  const base = baseUrl();
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, { ...init, signal: controller.signal });
  } catch {
    // ThinkCentre spento / tunnel giù / timeout → degrada con grazia
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invia una nuova osservazione DR/GPS e riceve lo stato aggiornato del filtro.
 * Ritorna `null` (senza lanciare) se il servizio non è raggiungibile.
 */
export async function updateKalman(obs: KalmanObservationInput): Promise<KalmanState | null> {
  const res = await kalmanFetch("/update", {
    method: "POST",
    headers: buildHeaders(true),
    body: JSON.stringify(obs),
  });
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as { ok?: boolean } & Partial<KalmanState>;
    if (!data.ok) return null;
    return data as KalmanState;
  } catch {
    return null;
  }
}

/**
 * Recupera lo stato corrente del filtro per un utente.
 * Ritorna `null` se sconosciuto o se il servizio non è raggiungibile.
 */
export async function getKalmanState(userId: string): Promise<KalmanState | null> {
  const res = await kalmanFetch(`/state/${encodeURIComponent(userId)}`, {
    method: "GET",
    headers: buildHeaders(false),
  });
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as { ok?: boolean } & Partial<KalmanState>;
    if (!data.ok) return null;
    return data as KalmanState;
  } catch {
    return null;
  }
}

/** Azzera il filtro di un utente. Ritorna true se la chiamata è andata a buon fine. */
export async function resetKalman(userId: string): Promise<boolean> {
  const res = await kalmanFetch(`/reset/${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: buildHeaders(false),
  });
  return Boolean(res && res.ok);
}
