/**
 * Nominatim Client — BikerLink
 *
 * Wrappa le chiamate al server Nominatim per geocoding e reverse geocoding.
 * Stesso pattern di graphhopper-client.ts e ollama-client.ts:
 * URL + token opzionale in header custom.
 *
 * Variabili d'ambiente:
 *   NOMINATIM_URL    — URL base del server Nominatim self-hosted
 *                      (es: https://nominatim.bikerlink.app)
 *                      Se non impostata, fallback a nominatim.openstreetmap.org
 *                      (pubblico, rate-limited, nessun token).
 *   NOMINATIM_TOKEN  — Token per il server self-hosted (header X-Nominatim-Token).
 *                      Ignorato se NOMINATIM_URL non è impostata.
 */

const SELF_HOSTED_URL = process.env.NOMINATIM_URL?.trim().replace(/\/$/, "") || undefined;
const SELF_HOSTED_TOKEN = process.env.NOMINATIM_TOKEN ?? "";
const PUBLIC_URL = "https://nominatim.openstreetmap.org";

const BASE_URL = SELF_HOSTED_URL ?? PUBLIC_URL;
const isSelfHosted = Boolean(SELF_HOSTED_URL);

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
  if (isSelfHosted && SELF_HOSTED_TOKEN) {
    h["X-Nominatim-Token"] = SELF_HOSTED_TOKEN;
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
 * Geocodifica una stringa di query testuale in coordinate geografiche.
 * Restituisce fino a 5 risultati ordinati per rilevanza.
 * I risultati sono cachati per 5 minuti per query univoca (case-insensitive,
 * trimmed) per ridurre le chiamate HTTP a Nominatim.
 *
 * @param query   Stringa di ricerca (es: "Milano", "Via Roma, Roma")
 * @returns       Array di risultati con nome e coordinate
 */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const cacheKey = query.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const path = `/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=it`;
  const res = await nominatimFetch(path);
  if (!res.ok) {
    throw new Error(`Nominatim geocode HTTP ${res.status}`);
  }
  type NominatimResult = { display_name: string; lat: string; lon: string };
  const data = await res.json() as NominatimResult[];
  const results: GeocodeResult[] = data.map((r) => ({
    name: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }));

  geocodeCache.set(cacheKey, results, GEOCODE_TTL_MS);
  return results;
}

// ─── Reverse Geocode ──────────────────────────────────────────────────────────

/**
 * Reverse geocoding: coordinate → indirizzo leggibile.
 * Le coordinate sono arrotondate a 4 decimali (~11 m) per chiave di cache,
 * con TTL di 10 minuti. Riduce chiamate ripetute per posizioni quasi identiche.
 *
 * @param lat   Latitudine
 * @param lon   Longitudine
 * @returns     Indirizzo strutturato (campi opzionali null se assenti)
 */
export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const rLat = lat.toFixed(COORD_DECIMALS);
  const rLon = lon.toFixed(COORD_DECIMALS);
  const cacheKey = `${rLat},${rLon}`;
  const cached = reverseCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const path = `/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&accept-language=it`;
  const res = await nominatimFetch(path);
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
