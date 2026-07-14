/**
 * Nominatim Client — BikerLink
 *
 * Wrappa le chiamate al server Nominatim per geocoding e reverse geocoding.
 * Stesso pattern di graphhopper-client.ts e ollama-client.ts:
 * URL + token opzionale in header custom.
 *
 * Variabili d'ambiente:
 *   NOMINATIM_URL    — URL base del server Nominatim self-hosted
 *                      (es: https://nominatim.biker-link.net)
 *                      Se non impostata, fallback a nominatim.openstreetmap.org
 *                      (pubblico, rate-limited, nessun token).
 *   NOMINATIM_TOKEN  — Token per il server self-hosted (header X-Nominatim-Token).
 *                      Ignorato se NOMINATIM_URL non è impostata.
 */

import { cfAccessHeaders } from "./cf-access";

const SELF_HOSTED_URL = process.env.NOMINATIM_URL?.trim().replace(/\/$/, "") || undefined;
const SELF_HOSTED_TOKEN = process.env.NOMINATIM_TOKEN ?? "";
const PUBLIC_URL = "https://nominatim.openstreetmap.org";
const PHOTON_URL = "https://photon.komoot.io";

const BASE_URL = SELF_HOSTED_URL ?? PUBLIC_URL;
const isSelfHosted = Boolean(SELF_HOSTED_URL);

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
  if (isSelfHosted) {
    console.log(`[Nominatim] Self-hosted mode — URL: ${BASE_URL}`);
  } else {
    console.warn("[Nominatim] Fallback al server pubblico nominatim.openstreetmap.org (rate-limited). Impostare NOMINATIM_URL per usare il server self-hosted.");
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
  if (isSelfHosted) {
    // Cloudflare Access Service Token: solo verso il server self-hosted, MAI
    // verso il Nominatim pubblico di terzi (vedi reverseGeocodeViaUrl).
    Object.assign(h, cfAccessHeaders());
    if (SELF_HOSTED_TOKEN) h["X-Nominatim-Token"] = SELF_HOSTED_TOKEN;
  }
  return h;
}

async function nominatimFetch(path: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: buildHeaders(),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface NominatimHealthSnapshot {
  configured: boolean;
  url: string;
  latencyMs: number | null;
  ok: boolean;
  error?: string;
}

function sanitizeNominatimError(msg: string): string {
  return msg.replace(/https?:\/\/[^\s"'`)]+/gi, (m) => maskUrl(m)).slice(0, 400);
}

/**
 * Probe leggero verso il server Nominatim (endpoint /status).
 * Usato dal pannello admin mappe per mostrare latenza e stato del geocoder.
 * Timeout ridotto a 5 s per non rallentare il caricamento dell'admin panel.
 */
export async function getNominatimHealthSnapshot(): Promise<NominatimHealthSnapshot> {
  const maskedUrl = maskUrl(BASE_URL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/status?format=json`, {
      headers: buildHeaders(),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      return { configured: isSelfHosted, url: maskedUrl, latencyMs, ok: true };
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
      ? sanitizeNominatimError(`HTTP ${res.status} — ${bodySnippet}`)
      : `HTTP ${res.status}`;
    return { configured: isSelfHosted, url: maskedUrl, latencyMs, ok: false, error };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { configured: isSelfHosted, url: maskedUrl, latencyMs: null, ok: false, error: sanitizeNominatimError(msg) };
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

// ─── Geocode ──────────────────────────────────────────────────────────────────

/**
 * Geocodifica via Nominatim (self-hosted o pubblico).
 * Lancia eccezione se il server è irraggiungibile o risponde con errore HTTP.
 */
async function geocodeNominatim(query: string): Promise<GeocodeResult[]> {
  const path = `/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=it`;
  const res = await nominatimFetch(path);
  if (!res.ok) {
    throw new Error(`Nominatim geocode HTTP ${res.status}`);
  }
  type NominatimResult = { display_name: string; lat: string; lon: string };
  const data = await res.json() as NominatimResult[];
  return data.map((r) => ({
    name: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }));
}

/**
 * Geocodifica via Photon (Komoot) — fallback gratuito basato su OSM.
 * Risponde in formato GeoJSON: features[].properties + geometry.coordinates.
 */
async function geocodePhoton(query: string): Promise<GeocodeResult[]> {
  const url = `${PHOTON_URL}/api/?q=${encodeURIComponent(query)}&limit=5&lang=it`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Photon geocode HTTP ${res.status}`);
    }
    type PhotonFeature = {
      geometry: { coordinates: [number, number] };
      properties: {
        name?: string;
        city?: string;
        state?: string;
        country?: string;
        street?: string;
        housenumber?: string;
      };
    };
    type PhotonResponse = { features: PhotonFeature[] };
    const data = await res.json() as PhotonResponse;
    return (data.features ?? []).map((f) => {
      const p = f.properties;
      const parts = [p.name, p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.street, p.city, p.state, p.country].filter(Boolean);
      return {
        name: parts.join(", "),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      };
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Geocodifica una stringa di query testuale in coordinate geografiche.
 * Tenta prima il provider primario (self-hosted o nominatim.org), poi
 * Photon (Komoot) come fallback se il primo fallisce. I risultati sono
 * cachati per 5 minuti. Lancia eccezione solo se entrambi i provider falliscono.
 *
 * Quando il ThinkCentre è dichiarato offline e il server è self-hosted, salta
 * direttamente a Photon senza attendere il timeout del server locale.
 *
 * @param query   Stringa di ricerca (es: "Milano", "Via Roma, Roma")
 * @returns       Array di risultati con nome e coordinate
 */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const cacheKey = query.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // ThinkCentre offline: se il geocoder è self-hosted, salta il tentativo locale
  // e vai direttamente a Photon senza attendere il timeout da 10 secondi.
  if (isSelfHosted) {
    const { isThinkCentreOffline } = await import("./thinkcentre-offline");
    if (await isThinkCentreOffline()) {
      console.log(`[Nominatim] geocode: ThinkCentre offline — fallback diretto a Photon per "${query}"`);
      try {
        const results = await geocodePhoton(query);
        geocodeCache.set(cacheKey, results, GEOCODE_TTL_MS);
        return results;
      } catch (photonErr) {
        console.error(`[Nominatim] geocode: Photon fallito per "${query}": ${(photonErr as Error).message}`);
        throw new Error("Geocoding non disponibile: ThinkCentre offline e Photon ha fallito");
      }
    }
  }

  let results: GeocodeResult[] | null = null;
  const primaryProvider = isSelfHosted ? "Nominatim self-hosted" : "Nominatim pubblico";

  try {
    results = await geocodeNominatim(query);
    console.log(`[Nominatim] geocode OK via ${primaryProvider} — ${results.length} risultati per "${query}"`);
  } catch (primaryErr) {
    console.warn(`[Nominatim] geocode fallito via ${primaryProvider} (${(primaryErr as Error).message}) — fallback Photon`);
    try {
      results = await geocodePhoton(query);
      console.log(`[Nominatim] geocode OK via Photon — ${results.length} risultati per "${query}"`);
    } catch (photonErr) {
      console.error(`[Nominatim] geocode fallito su entrambi i provider per "${query}": Photon → ${(photonErr as Error).message}`);
      throw new Error("Geocoding non disponibile: entrambi i provider hanno fallito");
    }
  }

  geocodeCache.set(cacheKey, results, GEOCODE_TTL_MS);
  return results;
}

// ─── Reverse Geocode ──────────────────────────────────────────────────────────

/**
 * Effettua una chiamata di reverse geocoding verso un URL base specifico.
 * Usato internamente per selezionare il provider (self-hosted o pubblico).
 *
 * @param includeAuthToken  Se true, include X-Nominatim-Token nell'header
 *                          (solo per il server self-hosted). Deve essere false
 *                          quando il target è un endpoint pubblico di terze parti,
 *                          per evitare di trasmettere credenziali private esternamente.
 */
async function reverseGeocodeViaUrl(
  baseUrl: string,
  lat: number,
  lon: number,
  zoom: number,
  includeAuthToken: boolean,
): Promise<Response> {
  const path = `/reverse?format=json&lat=${lat}&lon=${lon}&zoom=${zoom}&accept-language=it`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (includeAuthToken) {
    // CF Access + token custom solo verso il server self-hosted (mai a terzi).
    Object.assign(headers, cfAccessHeaders());
    if (SELF_HOSTED_TOKEN) headers["X-Nominatim-Token"] = SELF_HOSTED_TOKEN;
  }
  try {
    return await fetch(`${baseUrl}${path}`, {
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reverse geocoding: coordinate → indirizzo leggibile.
 * Le coordinate sono arrotondate a 4 decimali (~11 m) per chiave di cache,
 * con TTL di 10 minuti. Riduce chiamate ripetute per posizioni quasi identiche.
 *
 * Quando il ThinkCentre è dichiarato offline e il server è self-hosted, salta
 * il server locale e usa nominatim.openstreetmap.org direttamente.
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

  // ThinkCentre offline: se il geocoder è self-hosted, salta il server locale
  // e usa direttamente il Nominatim pubblico (nominatim.openstreetmap.org).
  // IMPORTANTE: quando il target è PUBLIC_URL, includeAuthToken=false per evitare
  // di trasmettere il token privato self-hosted a un endpoint di terze parti.
  let effectiveUrl = BASE_URL;
  let useAuthToken = isSelfHosted;
  if (isSelfHosted) {
    const { isThinkCentreOffline } = await import("./thinkcentre-offline");
    if (await isThinkCentreOffline()) {
      console.log(`[Nominatim] reverseGeocode: ThinkCentre offline — fallback a ${PUBLIC_URL}`);
      effectiveUrl = PUBLIC_URL;
      useAuthToken = false;
    }
  }

  const res = await reverseGeocodeViaUrl(effectiveUrl, lat, lon, zoom, useAuthToken);
  if (!res.ok) {
    throw new Error(`Nominatim reverse HTTP ${res.status}`);
  }
  type NominatimReverseResult = {
    display_name?: string;
    address?: {
      road?: string;
      suburb?: string;
      town?: string;
      city?: string;
      county?: string;
      country?: string;
    };
  };
  const data = await res.json() as NominatimReverseResult;
  const addr = data.address ?? {};
  const result: ReverseGeocodeResult = {
    displayName: data.display_name ?? "",
    road: addr.road ?? null,
    suburb: addr.suburb ?? null,
    town: addr.town ?? null,
    city: addr.city ?? null,
    county: addr.county ?? null,
    country: addr.country ?? null,
  };

  reverseCache.set(cacheKey, result, REVERSE_TTL_MS);
  return result;
}
