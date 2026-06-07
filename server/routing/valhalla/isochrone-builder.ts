/**
 * Isochrone builder + mapper — Valhalla /isochrone
 *
 * Costruisce il payload per POST /isochrone e mappa la risposta in
 * GeoJSON FeatureCollection di Polygon (un poligono per ogni contorno
 * di minuti richiesto).
 *
 * Valhalla /isochrone reference:
 *   https://valhalla.github.io/valhalla/api/isochrone/api-reference/
 */

const MOTORCYCLE_COSTING_OPTIONS = {
  use_highways: 0.3,
  use_trails: 0.0,
  use_ferry: 0.5,
  country_crossing_penalty: 0,
} as const;

export interface IsochroneContour {
  time: number;
  color?: string;
}

export interface IsochronePayload {
  locations: Array<{ lat: number; lon: number }>;
  costing: string;
  costing_options: Record<string, unknown>;
  contours: IsochroneContour[];
  polygons: true;
  denoise?: number;
  generalize?: number;
}

export interface IsochroneFeature {
  type: "Feature";
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
  properties: {
    contour: number;
    color?: string;
    [key: string]: unknown;
  };
}

export interface IsochroneResult {
  type: "FeatureCollection";
  features: IsochroneFeature[];
}

/**
 * Costruisce il payload per POST /isochrone di Valhalla.
 * @param lat        Latitudine del punto di partenza
 * @param lon        Longitudine del punto di partenza
 * @param minutes    Lista di intervalli in minuti (es. [10, 20, 30])
 */
export function buildValhallaIsochronePayload(
  lat: number,
  lon: number,
  minutes: number[],
): IsochronePayload {
  const contours: IsochroneContour[] = minutes.map((t) => ({ time: t }));

  return {
    locations: [{ lat, lon }],
    costing: "motorcycle",
    costing_options: {
      motorcycle: MOTORCYCLE_COSTING_OPTIONS,
    },
    contours,
    polygons: true,
    denoise: 1.0,
    generalize: 50,
  };
}

/**
 * Mappa la risposta Valhalla /isochrone in IsochroneResult (GeoJSON FeatureCollection).
 * Valhalla restituisce già un FeatureCollection — normalizziamo le properties
 * per garantire che `contour` (minuti) sia sempre presente.
 */
export function mapValhallaIsochroneResponse(raw: unknown): IsochroneResult {
  const r = raw as {
    type?: string;
    features?: Array<{
      type?: string;
      geometry?: unknown;
      properties?: Record<string, unknown>;
    }>;
  };

  if (!r || r.type !== "FeatureCollection" || !Array.isArray(r.features)) {
    throw new Error("Valhalla /isochrone: risposta non è un GeoJSON FeatureCollection valido");
  }

  const features: IsochroneFeature[] = r.features.map((f, idx) => ({
    type: "Feature" as const,
    geometry: f.geometry as IsochroneFeature["geometry"],
    properties: {
      ...(f.properties ?? {}),
      contour: (f.properties?.contour as number) ?? idx,
    },
  }));

  return {
    type: "FeatureCollection",
    features,
  };
}
