// Task #23 — Validazione di CORRETTEZZA (non solo raggiungibilità) delle risposte
// dei motori di routing e del geocoder. Funzioni PURE (nessun I/O) così da essere
// testabili in isolamento e riusabili sia dalle sonde live sia dai test.
//
// L'idea: un motore può rispondere 200 OK ma restituire un risultato SILENZIOSAMENTE
// sbagliato — geometria assente, distanza incoerente con la distanza in linea d'aria,
// durata a zero, geocoding vuoto o su coordinate palesemente errate. Questi controlli
// intercettano quei casi che una semplice sonda "online sì/no" lascerebbe passare.

/** Misure estratte da un RouteResult (schema GraphHopper; il client Valhalla vi mappa). */
export interface RouteMeasurements {
  distanceKm: number | null;
  durationMin: number | null;
  /** Numero di coordinate nella geometria (o 2 se polyline codificata non vuota). */
  coordCount: number;
  hasGeometry: boolean;
}

export interface PlausibilityResult {
  plausible: boolean;
  reason: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  impliedKmh: number | null;
}

/** Conta le coordinate di una geometria di percorso, tollerante allo schema. */
function extractCoordCount(points: unknown): number {
  if (!points) return 0;
  if (typeof points === "string") {
    // polyline codificata (points_encoded:true): non possiamo contare i punti,
    // trattiamo una stringa non vuota come "geometria presente".
    return points.trim().length > 0 ? 2 : 0;
  }
  if (typeof points === "object") {
    const coords = (points as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coords)) return coords.length;
  }
  return 0;
}

/** Estrae distanza/durata/geometria dal primo path di un RouteResult-like. */
export function measureRouteResult(result: unknown): RouteMeasurements {
  const paths = (result as { paths?: unknown } | null | undefined)?.paths;
  if (!Array.isArray(paths) || paths.length === 0) {
    return { distanceKm: null, durationMin: null, coordCount: 0, hasGeometry: false };
  }
  const p = paths[0] as { distance?: unknown; time?: unknown; points?: unknown };
  const distanceM = typeof p.distance === "number" && Number.isFinite(p.distance) ? p.distance : null;
  const timeMs = typeof p.time === "number" && Number.isFinite(p.time) ? p.time : null;
  const coordCount = extractCoordCount(p.points);
  return {
    distanceKm: distanceM != null ? distanceM / 1000 : null,
    durationMin: timeMs != null ? timeMs / 60_000 : null,
    coordCount,
    hasGeometry: coordCount >= 2,
  };
}

/**
 * Valida la plausibilità di un percorso data la distanza in linea d'aria attesa.
 * - geometria presente (≥2 punti)
 * - distanza e durata finite e positive
 * - distanza stradale coerente con l'aerea: [aerea*0.8 , aerea*8 + 5km]
 * - velocità media implicita in un intervallo umano [3 , 220] km/h
 */
export function validateRoutePlausibility(aerialKm: number, m: RouteMeasurements): PlausibilityResult {
  const base = { distanceKm: m.distanceKm, durationMin: m.durationMin, impliedKmh: null as number | null };
  if (!m.hasGeometry) {
    return { ...base, plausible: false, reason: "geometria assente (nessun punto nel percorso)" };
  }
  if (m.distanceKm == null || !(m.distanceKm > 0)) {
    return { ...base, plausible: false, reason: "distanza assente o nulla" };
  }
  if (m.durationMin == null || !(m.durationMin > 0)) {
    return { ...base, plausible: false, reason: "durata assente o nulla" };
  }
  const minKm = aerialKm * 0.8;
  const maxKm = aerialKm * 8 + 5;
  if (m.distanceKm < minKm) {
    return {
      ...base,
      plausible: false,
      reason: `distanza ${m.distanceKm.toFixed(1)}km sotto il minimo plausibile ${minKm.toFixed(1)}km (più corta della linea d'aria)`,
    };
  }
  if (m.distanceKm > maxKm) {
    return {
      ...base,
      plausible: false,
      reason: `distanza ${m.distanceKm.toFixed(1)}km oltre il massimo plausibile ${maxKm.toFixed(1)}km`,
    };
  }
  const impliedKmh = m.distanceKm / (m.durationMin / 60);
  if (!(impliedKmh >= 3) || impliedKmh > 220) {
    return {
      ...base,
      impliedKmh,
      plausible: false,
      reason: `velocità media implausibile ${impliedKmh.toFixed(0)}km/h`,
    };
  }
  return { ...base, impliedKmh, plausible: true, reason: null };
}

/** Un singolo risultato di geocoding (coordinate + nome, se presente). */
export interface GeocodeCandidate {
  lat: number;
  lon: number;
  name: string | null;
}

/** Misure estratte da una risposta Photon (GeoJSON FeatureCollection). */
export interface GeocodeMeasurements {
  featureCount: number;
  firstLat: number | null;
  firstLon: number | null;
  firstName: string | null;
  /** Fino a topN risultati con coordinate valide, in ordine di ranking Photon. */
  candidates: GeocodeCandidate[];
}

export interface GeocodePlausibilityResult {
  plausible: boolean;
  reason: string | null;
  featureCount: number;
  firstLat: number | null;
  firstLon: number | null;
}

function extractCandidate(feature: unknown): GeocodeCandidate | null {
  const f = feature as { geometry?: { coordinates?: unknown }; properties?: { name?: unknown } };
  const coords = f.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    const name = typeof f.properties?.name === "string" ? f.properties.name : null;
    return { lon: coords[0], lat: coords[1], name };
  }
  return null;
}

/**
 * Estrae il conteggio dei risultati e fino a `topN` coordinate candidate da una
 * risposta Photon, in ordine di ranking. Il ranking di un geocoder può variare
 * innocuamente tra due chiamate (indice riordinato, bias di viewbox, ecc.): non
 * fidarsi del SOLO primo risultato evita falsi positivi di correttezza.
 */
export function measurePhotonResponse(body: unknown, topN = 5): GeocodeMeasurements {
  const features = (body as { features?: unknown } | null | undefined)?.features;
  if (!Array.isArray(features) || features.length === 0) {
    return { featureCount: 0, firstLat: null, firstLon: null, firstName: null, candidates: [] };
  }
  const candidates: GeocodeCandidate[] = [];
  for (const f of features.slice(0, Math.max(topN, 1))) {
    const c = extractCandidate(f);
    if (c) candidates.push(c);
  }
  const first = candidates[0] ?? null;
  return {
    featureCount: features.length,
    firstLat: first?.lat ?? null,
    firstLon: first?.lon ?? null,
    firstName: first?.name ?? null,
    candidates,
  };
}

/**
 * Valida un risultato di geocoding.
 * - almeno un risultato (200 con features=[] è un errore silenzioso del geocoder)
 * - coordinate finite e nel range valido (sul primo risultato)
 * - se `expected` è fornito, ALMENO UNO dei risultati candidati (fino a topN,
 *   vedi `measurePhotonResponse`) deve cadere entro `tolKm` dal punto atteso.
 *   Non pretendiamo che sia esattamente il PRIMO: il ranking di un geocoder
 *   sano può normalmente riordinarsi (bias di viewbox, aggiornamento indice,
 *   ecc.) senza che il servizio sia rotto. Intercetta comunque il caso di
 *   geocoding "sbagliato ma OK" (es. Roma restituita altrove, nessun
 *   candidato vicino al punto atteso).
 *
 * Il calcolo della distanza è iniettato per non creare dipendenze (funzione pura).
 */
export function validateGeocodePlausibility(
  m: GeocodeMeasurements,
  opts?: {
    expected?: { lat: number; lon: number; tolKm: number };
    distanceKm?: (lat1: number, lon1: number, lat2: number, lon2: number) => number;
  },
): GeocodePlausibilityResult {
  const base = { featureCount: m.featureCount, firstLat: m.firstLat, firstLon: m.firstLon };
  if (m.featureCount === 0) {
    return { ...base, plausible: false, reason: "nessun risultato (geocoding vuoto)" };
  }
  if (m.firstLat == null || m.firstLon == null) {
    return { ...base, plausible: false, reason: "coordinate assenti nel primo risultato" };
  }
  if (m.firstLat < -90 || m.firstLat > 90 || m.firstLon < -180 || m.firstLon > 180) {
    return { ...base, plausible: false, reason: `coordinate fuori range (${m.firstLat}, ${m.firstLon})` };
  }
  const expected = opts?.expected;
  const distanceKm = opts?.distanceKm;
  if (expected && distanceKm) {
    const candidates = m.candidates.length > 0 ? m.candidates : [{ lat: m.firstLat, lon: m.firstLon, name: null }];
    let closestKm = Infinity;
    for (const c of candidates) {
      const d = distanceKm(c.lat, c.lon, expected.lat, expected.lon);
      if (d < closestKm) closestKm = d;
      if (d <= expected.tolKm) {
        closestKm = d;
        break;
      }
    }
    if (closestKm > expected.tolKm) {
      return {
        ...base,
        plausible: false,
        reason: `nessuno dei primi ${candidates.length} risultati è entro ${expected.tolKm}km dal punto atteso (il più vicino è a ${closestKm.toFixed(0)}km) — geocoding errato?`,
      };
    }
  }
  return { ...base, plausible: true, reason: null };
}
