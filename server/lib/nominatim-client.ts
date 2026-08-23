/**
 * Photon Local Client — BikerLink
 *
 * Provider unico obbligatorio: Photon locale.
 * Nessun Nominatim, nessun Photon pubblico, nessun fallback.
 */

const PHOTON_URL = (
  process.env.PHOTON_URL?.trim() || "http://127.0.0.1:2322"
).replace(/\/$/, "");

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "BikerLink/4.0 (info@bikerlink.it)";

console.log(`[Photon] local-only mode — URL: ${PHOTON_URL}`);

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
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  purgeExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  stats() {
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

const GEOCODE_TTL_MS = 5 * 60 * 1000;
const REVERSE_TTL_MS = 10 * 60 * 1000;
const COORD_DECIMALS = 4;

const geocodeCache = new TtlCache<GeocodeResult[]>();
const reverseCache = new TtlCache<ReverseGeocodeResult>();

setInterval(() => {
  geocodeCache.purgeExpired();
  reverseCache.purgeExpired();
}, 15 * 60 * 1000).unref();

export function getGeocodeCacheStats() {
  return {
    geocode: geocodeCache.stats(),
    reverse: reverseCache.stats(),
  };
}

async function photonFetch(
  path: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${PHOTON_URL}${path}`, {
      headers: {
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function photonJson<T>(
  path: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const response = await photonFetch(path, timeoutMs);
  if (!response.ok) {
    throw new Error(`Photon HTTP ${response.status}`);
  }
  return await response.json() as T;
}

export interface NominatimHealthSnapshot {
  configured: boolean;
  url: string;
  latencyMs: number | null;
  ok: boolean;
  error?: string;
}

/**
 * Nome mantenuto per compatibilità con il pannello admin esistente.
 * Il probe verifica esclusivamente Photon locale.
 */
export async function getNominatimHealthSnapshot(): Promise<NominatimHealthSnapshot> {
  const startedAt = Date.now();

  try {
    const response = await photonFetch(
      "/api?q=Venezia&limit=1&lang=it",
      5_000,
    );
    const latencyMs = Date.now() - startedAt;

    if (response.ok) {
      await response.text();
      return {
        configured: true,
        url: PHOTON_URL,
        latencyMs,
        ok: true,
      };
    }

    const body = (await response.text()).trim().slice(0, 300);
    return {
      configured: true,
      url: PHOTON_URL,
      latencyMs,
      ok: false,
      error: body
        ? `HTTP ${response.status} — ${body}`
        : `HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      configured: true,
      url: PHOTON_URL,
      latencyMs: null,
      ok: false,
      error: message.slice(0, 400),
    };
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

interface PhotonProperties {
  name?: string;
  city?: string;
  town?: string;
  locality?: string;
  district?: string;
  suburb?: string;
  county?: string;
  state?: string;
  country?: string;
  street?: string;
  housenumber?: string;
}

interface PhotonFeature {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: PhotonProperties;
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

function formatPhotonName(properties: PhotonProperties): string {
  const street = properties.street && properties.housenumber
    ? `${properties.street} ${properties.housenumber}`
    : properties.street;

  const parts = [
    properties.name,
    street,
    properties.city ?? properties.town,
    properties.state,
    properties.country,
  ].filter(Boolean) as string[];

  return [...new Set(parts)].join(", ");
}

function toGeocodeResult(feature: PhotonFeature): GeocodeResult | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates) return null;

  const [lng, lat] = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    name: formatPhotonName(feature.properties ?? {}),
    lat,
    lng,
  };
}

export async function geocode(query: string): Promise<GeocodeResult[]> {
  const cacheKey = query.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const data = await photonJson<PhotonResponse>(
    `/api?q=${encodeURIComponent(query)}&limit=5&lang=it`,
  );

  const results = (data.features ?? [])
    .map(toGeocodeResult)
    .filter((result): result is GeocodeResult => result !== null);

  geocodeCache.set(cacheKey, results, GEOCODE_TTL_MS);
  return results;
}

export async function reverseGeocode(
  lat: number,
  lon: number,
  zoom = 14,
): Promise<ReverseGeocodeResult> {
  const rLat = lat.toFixed(COORD_DECIMALS);
  const rLon = lon.toFixed(COORD_DECIMALS);
  const cacheKey = `${rLat},${rLon},z${zoom}`;
  const cached = reverseCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const data = await photonJson<PhotonResponse>(
    `/reverse?lat=${lat}&lon=${lon}&lang=it`,
  );

  const feature = data.features?.[0];
  if (!feature) {
    throw new Error("Photon reverse: nessun risultato");
  }

  const properties = feature.properties ?? {};
  const result: ReverseGeocodeResult = {
    displayName: formatPhotonName(properties),
    road: properties.street ?? null,
    suburb: properties.suburb ?? properties.district ?? null,
    town: properties.town ?? properties.locality ?? null,
    city: properties.city ?? null,
    county: properties.county ?? null,
    country: properties.country ?? null,
  };

  reverseCache.set(cacheKey, result, REVERSE_TTL_MS);
  return result;
}
