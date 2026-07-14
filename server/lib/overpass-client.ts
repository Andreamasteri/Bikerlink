/**
 * Overpass API Client — BikerLink
 *
 * Ricerca POI (ristoranti, hotel, rifugi, ecc.) via Overpass QL.
 * Usato dal flusso AI per risolvere poiStops non geocodificabili con Photon.
 *
 * TTL cache: 10 min | Timeout: 8 s | Max risultati: 10
 *
 * Self-hosting: impostare OVERPASS_URL per puntare a un'istanza locale
 * (es. su ThinkCentre). Se ThinkCentre è offline, la ricerca salta
 * automaticamente all'endpoint pubblico senza attendere il timeout.
 */

const PUBLIC_URL = "https://overpass-api.de/api/interpreter";
const SELF_HOSTED_URL = process.env.OVERPASS_URL?.trim().replace(/\/$/, "") || undefined;
const isSelfHosted = Boolean(SELF_HOSTED_URL);

const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_RESULTS = 10;

// ─── Tipi pubblici ────────────────────────────────────────────────────────────

export interface PoiResult {
  name: string;
  lat: number;
  lng: number;
  address: string;
  category: string;
}

// ─── Mappatura keyword → tag OSM ─────────────────────────────────────────────

interface OsmTag {
  key: string;
  value: string;
  category: string;
}

const KEYWORD_MAP: Array<{ keywords: string[]; tags: OsmTag[] }> = [
  {
    keywords: ["trattoria", "ristorante", "osteria", "pizzeria", "cibo", "mangiare", "pranzo", "cena"],
    tags: [{ key: "amenity", value: "restaurant", category: "restaurant" }],
  },
  {
    keywords: ["bar", "caffè", "caffe", "colazione", "aperitivo", "caffetteria"],
    tags: [{ key: "amenity", value: "cafe", category: "cafe" }],
  },
  {
    keywords: ["benzina", "carburante", "distributore", "rifornimento", "gasolio"],
    tags: [{ key: "amenity", value: "fuel", category: "fuel" }],
  },
  {
    keywords: ["officina", "meccanico", "moto", "riparazione", "gommista"],
    tags: [
      { key: "shop", value: "motorcycle_repair", category: "motorcycle" },
      { key: "shop", value: "motorcycle", category: "motorcycle" },
    ],
  },
  {
    keywords: ["rifugio", "alpino", "montagna", "baita"],
    tags: [{ key: "tourism", value: "alpine_hut", category: "alpine_hut" }],
  },
  {
    keywords: ["hotel", "albergo", "b&b", "bb", "bed", "breakfast", "ostello", "hostel", "guest", "alloggio", "dormire", "pernottare", "notte", "soggiorno"],
    tags: [
      { key: "tourism", value: "hotel", category: "hotel" },
      { key: "tourism", value: "hostel", category: "hotel" },
      { key: "tourism", value: "guest_house", category: "hotel" },
    ],
  },
  {
    keywords: ["campeggio", "camping", "tenda", "camper"],
    tags: [{ key: "tourism", value: "camp_site", category: "camp_site" }],
  },
  {
    keywords: ["parcheggio", "parking", "sosta"],
    tags: [{ key: "amenity", value: "parking", category: "parking" }],
  },
  {
    keywords: ["ospedale", "pronto soccorso", "medico", "farmacia"],
    tags: [
      { key: "amenity", value: "hospital", category: "hospital" },
      { key: "amenity", value: "pharmacy", category: "pharmacy" },
    ],
  },
  {
    keywords: ["supermercato", "alimentari", "spesa", "negozio"],
    tags: [{ key: "shop", value: "supermarket", category: "shop" }],
  },
];

/** Restituisce le tag OSM pertinenti alla query in linguaggio naturale. */
function resolveOsmTags(query: string): OsmTag[] {
  const lower = query.toLowerCase();
  const matched: OsmTag[] = [];
  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      matched.push(...entry.tags);
    }
  }
  if (matched.length === 0) {
    matched.push(
      { key: "amenity", value: "restaurant", category: "restaurant" },
      { key: "tourism", value: "attraction", category: "attraction" },
    );
  }
  return matched;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  value: PoiResult[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCache(key: string): PoiResult[] | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return undefined; }
  return entry.value;
}

function setCache(key: string, value: PoiResult[]): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

setInterval(() => {
  const now = Date.now();
  for (const [k, e] of cache) { if (now > e.expiresAt) cache.delete(k); }
}, CACHE_TTL_MS).unref();

// ─── Overpass fetch ───────────────────────────────────────────────────────────

type OverpassElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function buildOverpassQuery(tags: OsmTag[], lat: number, lng: number, radiusM: number): string {
  const parts = tags.map((t) => `nwr["${t.key}"="${t.value}"](around:${radiusM},${lat},${lng});`).join("\n");
  return `[out:json][timeout:8];\n(\n${parts}\n);\nout body center ${MAX_RESULTS * 3};`;
}

function elemToResult(el: OverpassElement, defaultCategory: string): PoiResult | null {
  const elLat = el.lat ?? el.center?.lat;
  const elLon = el.lon ?? el.center?.lon;
  const name = el.tags?.name;
  if (!elLat || !elLon || !name) return null;

  const addr = [
    el.tags?.["addr:street"],
    el.tags?.["addr:housenumber"],
    el.tags?.["addr:city"] ?? el.tags?.["addr:town"],
  ].filter(Boolean).join(" ");

  return {
    name,
    lat: elLat,
    lng: elLon,
    address: addr || el.tags?.["description"] || "",
    category: defaultCategory,
  };
}

/**
 * Cerca POI tramite Overpass API attorno alle coordinate indicate.
 *
 * @param query     Descrizione testuale dell'utente (es: "trattoria di carne")
 * @param lat       Latitudine centro di ricerca
 * @param lng       Longitudine centro di ricerca
 * @param radiusKm  Raggio di ricerca in km (default 15 km)
 * @returns         Max 10 risultati con nome, coordinate e indirizzo
 */
export async function searchPoi(
  query: string,
  lat: number,
  lng: number,
  radiusKm = 15,
): Promise<PoiResult[]> {
  const radiusM = Math.round(radiusKm * 1000);
  const cacheKey = `${query.toLowerCase().trim()}|${lat.toFixed(3)},${lng.toFixed(3)}|${radiusM}`;

  const cached = getCache(cacheKey);
  if (cached !== undefined) return cached;

  // ThinkCentre offline: se Overpass è self-hosted, salta il server locale
  // e usa direttamente l'endpoint pubblico (overpass-api.de) senza attendere il timeout.
  let effectiveUrl = SELF_HOSTED_URL ?? PUBLIC_URL;
  if (isSelfHosted) {
    const { isThinkCentrePoweredOff } = await import("./thinkcentre-powered-off");
    if (await isThinkCentrePoweredOff()) {
      console.log(`[overpass] ThinkCentre offline — fallback diretto a ${PUBLIC_URL} per "${query}"`);
      effectiveUrl = PUBLIC_URL;
    }
  }

  const tags = resolveOsmTags(query);
  const oQuery = buildOverpassQuery(tags, lat, lng, radiusM);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(effectiveUrl, {
      method: "POST",
      body: "data=" + encodeURIComponent(oQuery),
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "BikerLink/4.0" },
      signal: controller.signal,
    });

    if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);

    const data = await resp.json() as { elements?: OverpassElement[] };
    const elements = data.elements ?? [];

    const seen = new Set<string>();
    const raw: PoiResult[] = [];

    for (const el of elements) {
      if (raw.length >= MAX_RESULTS * 3) break;
      const category = tags.find((t) => el.tags?.[t.key] === t.value)?.category ?? tags[0].category;
      const r = elemToResult(el, category);
      if (!r) continue;
      const dedupKey = `${r.name.toLowerCase()}|${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      raw.push(r);
    }

    // Lightweight text-relevance ranking: risultati il cui nome contiene
    // almeno un token della query vengono promossi in cima.
    const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const results = raw
      .map((r) => {
        const nameLower = r.name.toLowerCase();
        const score = queryTokens.filter((t) => nameLower.includes(t)).length;
        return { r, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((x) => x.r);

    setCache(cacheKey, results);
    return results;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "AbortError") {
      console.warn("[overpass] timeout dopo 8s per query:", query);
    } else {
      console.error("[overpass] errore:", (err as Error)?.message ?? err);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Categorie considerate "alloggio" per mostrare il bottone Booking.com. */
export const ACCOMMODATION_CATEGORIES = new Set(["hotel", "hostel", "guest_house", "camp_site"]);
