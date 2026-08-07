/**
 * Photon Client — BikerLink
 *
 * Wrappa le chiamate al server Photon self-hosted per geocoding e reverse
 * geocoding. Stesso pattern di graphhopper-client.ts e ollama-client.ts:
 * URL + token custom in header, dietro Cloudflare Access.
 *
 * Photon è un motore di geocoding basato su OSM/Elasticsearch. Risponde in
 * formato GeoJSON: features[].geometry.coordinates = [lon, lat] e
 * features[].properties con i campi indirizzo.
 *
 * SOLO self-hosted: nessun fallback a server pubblici (né photon.komoot.io né
 * provider precedente.openstreetmap.org). Se PHOTON_URL/PHOTON_TOKEN non sono configurati
 * o il ThinkCentre è offline, le chiamate falliscono in modo esplicito.
 *
 * Variabili d'ambiente (secret Replit):
 *   PHOTON_URL    — URL base del server Photon self-hosted
 *                   (es: https://photon.biker-link.net). Se non impostata, il
 *                   geocoding è disabilitato (errore esplicito).
 *   PHOTON_TOKEN  — Token per il server self-hosted (header X-Photon-Token).
 */

import { cfAccessHeaders } from "./cf-access";

const SELF_HOSTED_URL = process.env.PHOTON_URL?.trim().replace(/\/$/, "") || undefined;
const SELF_HOSTED_TOKEN = process.env.PHOTON_TOKEN ?? "";

const isConfigured = Boolean(SELF_HOSTED_URL);

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return url.slice(0, 40);
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "BikerLink/4.0 (info@bikerlink.it)";

void (async () => {
  if (isConfigured) {
    console.log(`[Photon] Self-hosted mode — URL: ${SELF_HOSTED_URL}`);
  } else {
    console.warn("[Photon] PHOTON_URL non configurato — geocoding disabilitato (nessun fallback pubblico). Impostare PHOTON_URL/PHOTON_TOKEN.");
  }
})();

// ─── TTL Cache ────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) { this.misses++; return undefined; }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Rimuove le voci scadute (pulizia periodica opzionale). */
  purgeExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [k, entry] of this.store) {
      if (now > entry.expiresAt) { this.store.delete(k); removed++; }
    }
    return removed;
  }

  stats() {
    return { size: this.store.size, hits: this.hits, misses: this.misses };
  }
}

const GEOCODE_TTL_MS = 5 * 60 * 1000;     // 5 minuti
const REVERSE_TTL_MS = 10 * 60 * 1000;    // 10 minuti
const COORD_DECIMALS = 4;                  // ~11 m di precisione → bucket stabile

const geocodeCache = new TtlCache<GeocodeResult[]>();
const reverseCache = new TtlCache<ReverseGeocodeResult>();

// Pulizia periodica delle voci scadute ogni 15 minuti.
// Evita accumulo illimitato di chiavi scadute in scenari ad alta cardinalità.
setInterval(() => {
  geocodeCache.purgeExpired();
  reverseCache.purgeExpired();
}, 15 * 60 * 1000).unref();

/** Statistiche cache esposte per il pannello admin. */
export function getGeocodeCacheStats() {
  return {
    geocode: geocodeCache.stats(),
    reverse: reverseCache.stats(),
  };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function buildHeaders(): Record<string, string> {
  const h: Record<string, string> = { "User-Agent": USER_AGENT };
  // Cloudflare Access Service Token + token custom: SOLO verso il server
  // self-hosted (Photon non è mai un endpoint pubblico di terzi).
  Object.assign(h, cfAccessHeaders());
  if (SELF_HOSTED_TOKEN) h["X-Photon-Token"] = SELF_HOSTED_TOKEN;
  return h;
}

async function photonFetch(path: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${SELF_HOSTED_URL}${path}`, {
      headers: buildHeaders(),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verifica che Photon sia configurato e che il ThinkCentre non sia offline.
 * Lancia un errore esplicito altrimenti — mai fallback pubblico.
 */
async function ensureAvailable(op: string): Promise<void> {
  if (!isConfigured) {
    throw new Error(`Geocoding non disponibile: Photon non configurato (PHOTON_URL mancante) — ${op}`);
  }
  const { isThinkCentreOffline } = await import("./thinkcentre-offline");
  if (await isThinkCentreOffline()) {
    throw new Error(`Geocoding non disponibile: ThinkCentre offline — ${op}`);
  }
}

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface PhotonHealthSnapshot {
  configured: boolean;
  url: string;
  latencyMs: number | null;
  ok: boolean;
  error?: string;
}

function sanitizePhotonError(msg: string): string {
  return msg.replace(/https?:\/\/[^\s"'`)]+/gi, (m) => maskUrl(m)).slice(0, 400);
}

/**
 * Probe leggero verso il server Photon.
 * Photon non ha un endpoint /status: usiamo una query di geocoding minima
 * ("Roma") per misurare disponibilità e latenza. Usato dal pannello admin mappe
 * per mostrare latenza e stato del geocoder. Timeout ridotto a 5 s.
 */
export async function getPhotonHealthSnapshot(): Promise<PhotonHealthSnapshot> {
  const maskedUrl = isConfigured ? maskUrl(SELF_HOSTED_URL as string) : "non configurato";
  if (!isConfigured) {
    return { configured: false, url: maskedUrl, latencyMs: null, ok: false, error: "PHOTON_URL non configurato" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  const t0 = Date.now();
  try {
    const res = await fetch(`${SELF_HOSTED_URL}/api/?q=Roma&limit=1&lang=default`, {
      headers: buildHeaders(),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      return { configured: true, url: maskedUrl, latencyMs, ok: true };
    }
    let bodySnippet = "";
    try {
      const text = await Promise.race([
        res.text(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("body-timeout")), 2_000)),
      ]);
      bodySnippet = text.trim().slice(0, 400);
    } catch { /* ignore */ }
    const error = bodySnippet
      ? sanitizePhotonError(`HTTP ${res.status} — ${bodySnippet}`)
      : `HTTP ${res.status}`;
    return { configured: true, url: maskedUrl, latencyMs, ok: false, error };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { configured: true, url: maskedUrl, latencyMs: null, ok: false, error: sanitizePhotonError(msg) };
  } finally {
    clearTimeout(timer);
  }
}

export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
}

export interface ReverseGeocodeResult {
  displayName: string;
  road: string | null;
  suburb: string | null;
  town: string | null;
  city: string | null;
  county: string | null;
  country: string | null;
}

// ─── Photon response types ──────────────────────────────────────────────────

interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: PhotonProperties;
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

/** Compone un nome leggibile dalle proprietà Photon. */
function composeName(p: PhotonProperties): string {
  const street = p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.street;
  return [p.name, street, p.city, p.state, p.country].filter(Boolean).join(", ");
}

// ─── Geocode ──────────────────────────────────────────────────────────────────

/**
 * Geocodifica una stringa di query testuale in coordinate geografiche via
 * Photon self-hosted. I risultati sono cachati per 5 minuti.
 *
 * Photon self-hosted: lancia eccezione se Photon non è configurato,
 * il ThinkCentre è offline, o il server risponde con errore HTTP.
 *
 * @param query   Stringa di ricerca (es: "Milano", "Via Roma, Roma")
 * @returns       Array di risultati con nome e coordinate
 */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const cacheKey = query.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  await ensureAvailable(`geocode "${query}"`);

  const path = `/api/?q=${encodeURIComponent(query)}&limit=5&lang=default`;
  const res = await photonFetch(path);
  if (!res.ok) {
    throw new Error(`Photon geocode HTTP ${res.status}`);
  }
  const data = await res.json() as PhotonResponse;
  const results: GeocodeResult[] = (data.features ?? []).map((f) => ({
    name: composeName(f.properties),
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }));

  console.log(`[Photon] geocode OK — ${results.length} risultati per "${query}"`);
  geocodeCache.set(cacheKey, results, GEOCODE_TTL_MS);
  return results;
}

// ─── Reverse Geocode ──────────────────────────────────────────────────────────

/**
 * Reverse geocoding: coordinate → indirizzo leggibile via Photon self-hosted.
 * Le coordinate sono arrotondate a 4 decimali (~11 m) per chiave di cache,
 * con TTL di 10 minuti. Riduce chiamate ripetute per posizioni quasi identiche.
 *
 * Nessun fallback pubblico: lancia eccezione se Photon non è configurato,
 * il ThinkCentre è offline, o il server risponde con errore HTTP.
 *
 * Nota: Photon non usa il parametro `zoom`; è mantenuto
 * nella firma per compatibilità con i chiamanti ma non viene inviato.
 *
 * @param lat   Latitudine
 * @param lon   Longitudine
 * @returns     Indirizzo strutturato (campi opzionali null se assenti)
 */
export async function reverseGeocode(lat: number, lon: number, zoom = 14): Promise<ReverseGeocodeResult> {
  const rLat = lat.toFixed(COORD_DECIMALS);
  const rLon = lon.toFixed(COORD_DECIMALS);
  const cacheKey = `${rLat},${rLon},z${zoom}`;
  const cached = reverseCache.get(cacheKey);
  if (cached !== undefined) return cached;

  await ensureAvailable(`reverseGeocode ${rLat},${rLon}`);

  const path = `/reverse?lat=${lat}&lon=${lon}&limit=1&lang=default`;
  const res = await photonFetch(path);
  if (!res.ok) {
    throw new Error(`Photon reverse HTTP ${res.status}`);
  }
  const data = await res.json() as PhotonResponse;
  const feature = (data.features ?? [])[0];
  const p = feature?.properties ?? {};
  const result: ReverseGeocodeResult = {
    displayName: composeName(p),
    road: p.street ?? null,
    suburb: p.district ?? null,
    town: null,
    city: p.city ?? null,
    county: p.county ?? null,
    country: p.country ?? null,
  };

  reverseCache.set(cacheKey, result, REVERSE_TTL_MS);
  return result;
}
