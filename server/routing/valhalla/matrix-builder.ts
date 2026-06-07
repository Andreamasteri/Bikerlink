/**
 * Matrix builder + mapper — Valhalla /sources_to_targets
 *
 * Costruisce il payload per POST /sources_to_targets e mappa la risposta
 * in una matrice strutturata di tempi (secondi) e distanze (metri).
 *
 * Valhalla /sources_to_targets reference:
 *   https://valhalla.github.io/valhalla/api/matrix/api-reference/
 */

const MOTORCYCLE_COSTING_OPTIONS = {
  use_highways: 0.3,
  use_trails: 0.0,
  use_ferry: 0.5,
  country_crossing_penalty: 0,
} as const;

export interface MatrixLocation {
  lat: number;
  lon: number;
}

export interface MatrixPayload {
  sources: MatrixLocation[];
  targets: MatrixLocation[];
  costing: string;
  costing_options: Record<string, unknown>;
}

export interface MatrixCell {
  durationSec: number | null;
  distanceM: number | null;
}

export interface MatrixResult {
  origins: Array<{ lat: number; lon: number }>;
  destinations: Array<{ lat: number; lon: number }>;
  matrix: MatrixCell[][];
}

/**
 * Punto nel formato interno [lng, lat] (GeoJSON) o {lat, lon}.
 */
export type LatLon = { lat: number; lon: number };

/**
 * Costruisce il payload per POST /sources_to_targets di Valhalla.
 * @param origins      Lista di punti di partenza { lat, lon }
 * @param destinations Lista di punti di destinazione { lat, lon }
 */
export function buildValhallaMatrixPayload(
  origins: LatLon[],
  destinations: LatLon[],
): MatrixPayload {
  return {
    sources: origins.map(({ lat, lon }) => ({ lat, lon })),
    targets: destinations.map(({ lat, lon }) => ({ lat, lon })),
    costing: "motorcycle",
    costing_options: {
      motorcycle: MOTORCYCLE_COSTING_OPTIONS,
    },
  };
}

/**
 * Mappa la risposta Valhalla /sources_to_targets in MatrixResult.
 *
 * La risposta Valhalla è:
 * {
 *   sources_to_targets: [[{ time: number, distance: number, to_index: number, from_index: number }, ...], ...],
 *   sources: [...],
 *   targets: [...]
 * }
 *
 * Ogni cella può avere time/distance null se il percorso non è raggiungibile.
 * time è in secondi, distance è in km → convertiamo in metri.
 */
export function mapValhallaMatrixResponse(
  raw: unknown,
  origins: LatLon[],
  destinations: LatLon[],
): MatrixResult {
  const r = raw as {
    sources_to_targets?: Array<
      Array<{
        time?: number | null;
        distance?: number | null;
        to_index?: number;
        from_index?: number;
      }>
    >;
  };

  if (!r || !Array.isArray(r.sources_to_targets)) {
    throw new Error("Valhalla /sources_to_targets: risposta mancante o malformata");
  }

  const matrix: MatrixCell[][] = r.sources_to_targets.map((row) =>
    row.map((cell) => ({
      durationSec: cell.time ?? null,
      distanceM: cell.distance != null ? Math.round(cell.distance * 1000) : null,
    })),
  );

  return {
    origins,
    destinations,
    matrix,
  };
}
